/**
 * Automatic withdrawal processing engine — ported from legacy/server/cron/withdrawalsCron.ts.
 *
 * Extends withdrawal.service.ts (manual request) + withdrawal.controller.ts (admin
 * approve/reject/complete) with the piece their header explicitly marked as deferred:
 * auto-send of already-`approved` withdrawals, either straight from the hot wallet or via
 * CoinEx (see withdrawal.coinex.ts).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * SAFETY / SCOPE — READ BEFORE CHANGING
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * - No real private key is baked in anywhere. The ONLY source of signing key material is
 *   `process.env.WITHDRAWAL_PRIVATE_KEY`, read via polygonSigner.ts.
 * - In THIS environment (dev container, no env vars configured) `WITHDRAWAL_PRIVATE_KEY` is
 *   unset, so `getWithdrawalHotWallet()` returns null and every tick runs in SAFE MODE: it
 *   logs and returns without claiming/signing/sending anything. This was verified by a
 *   smoke-test run against the real dev Postgres — see tests/wallet/withdrawal.auto-send.*
 *   for the automated coverage.
 * - Real production activation (setting a REAL WITHDRAWAL_PRIVATE_KEY on a funded hot wallet)
 *   is an explicit OUT-OF-SCOPE, manual, human step — never done by this code or by any
 *   agent. Nothing here ever broadcasts a transaction in a test context.
 *
 * Ported safety behaviors (preserved faithfully, not simplified):
 *  - WITHDRAWAL_AUTO_SEND master on/off flag
 *  - WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE emergency kill switch
 *  - WITHDRAWAL_VIA_COINEX route selector (hot-wallet is the default/live path)
 *  - Per-user daily cap: WITHDRAWAL_AUTO_SEND_MAX_PER_DAY_PER_USER (default 3)
 *  - Per-tick cap: MAX_WITHDRAWALS_PER_TICK (20)
 *  - Hot-wallet insufficient-balance cooldown (in-process — see NOTE below)
 *  - Gas cost: NATIVE_TRANSFER_GAS (21_000n fixed) * current gas price * GAS_PRICE_SAFETY_FACTOR
 *    (3n) — deliberately NOT a percentage of the transfer amount (legacy comment: that
 *    approach was ~100x the real cost and starved the queue).
 *  - Active-mining deferral: skip a user's auto-send while their auto-mining heartbeat is
 *    < 60s old (`autoMiningLastHeartbeatAt` on `User`).
 *  - Claim-before-send: an approved row is atomically flipped to `processing` before any
 *    signing/network call, so two concurrent ticks can never double-send the same withdrawal.
 *
 * Deviations from legacy (documented, not silent):
 *  - Redis lock (`AUTO_SEND_LOCK_KEY`, TTL 90s) and the hot-wallet cooldown flag are now
 *    ported as real Redis keys (see core/redis/index.ts), exactly as legacy has them —
 *    `SET NX PX` for the lock (owner-token compare-and-delete release via Lua, same as
 *    legacy) and `SET EX` / `PTTL` for the cooldown flag. When `REDIS_URL` is unset or
 *    Redis is unreachable, both fall back automatically to the single-process in-memory
 *    substitutes below (`_tickInFlight` / `_hotWalletCooldownUntilMs`) — safe for a
 *    single-process deployment, weaker (but functional) under multiple containers without
 *    Redis. The per-row claim (withdrawal.repository.ts `claimWithdrawalForSend`, an atomic
 *    `UPDATE ... WHERE status = 'approved'`) remains the last-line safety net against
 *    double-send regardless of which lock layer is active.
 *  - `WITHDRAWAL_MNEMONIC` fallback was not ported (see polygonSigner.ts) — key material has
 *    exactly one source now.
 *  - No dedicated "auto-sent" DB marker exists on `Transaction` in `current/`, so the daily
 *    cap counts ALL completed withdrawals for the user that day (auto or admin-manual) — see
 *    `countAutoSentToday` in withdrawal.repository.ts.
 *  - System-level audit logging (legacy `createAuditLogBestEffort`) was not wired in — no
 *    equivalent system-actor audit sink exists in `current/` yet (admin.audit-log.service.ts
 *    is scoped to admin-initiated actions). Logger + Telegram alerts remain as observability.
 */
import crypto from "node:crypto";
import { ethers } from "ethers";
import { logger } from "../../../core/logger/index.js";
import { getRedis } from "../../../core/redis/index.js";
import { getSharedPolygonProvider } from "../../../shared/blockchain/polygonProvider.js";
import { getWithdrawalHotWallet, isWithdrawalPrivateKeyConfigured } from "../../../shared/blockchain/polygonSigner.js";
import { notifyAutoWithdrawalSent, notifyWithdrawalCompleted, notifyHotWalletLowBalance } from "../../notifications/telegram.service.js";
import * as withdrawalRepo from "./withdrawal.repository.js";
import { isCoinExConfigured, submitCoinExWithdrawal, getCoinExWithdrawalStatus, CoinExNotConfiguredError } from "./withdrawal.coinex.js";

const log = logger.child("WithdrawalAutoSend");

/** Fixed gas cost of a native POL transfer — does NOT scale with the amount sent. */
export const NATIVE_TRANSFER_GAS = 21_000n;
/** Safety margin over the current gas price to tolerate spikes between pre-flight and send. */
export const GAS_PRICE_SAFETY_FACTOR = 3n;
/** Cap on withdrawals processed per tick — avoids holding the claim loop open too long. */
export const MAX_WITHDRAWALS_PER_TICK = 20;
/** Window in which a recent auto-mining heartbeat defers a user's auto-send to next tick. */
const AUTOMINE_HEARTBEAT_RECENT_MS = 60_000;

function truthyFlag(name: string): boolean {
  const v = String(process.env[name] || "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function withdrawalAutoSendEnabled(): boolean {
  return truthyFlag("WITHDRAWAL_AUTO_SEND");
}

export function withdrawalGlobalPause(): boolean {
  return truthyFlag("WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE");
}

export function withdrawalViaCoinExEnabled(): boolean {
  return truthyFlag("WITHDRAWAL_VIA_COINEX");
}

export function autoSendMaxPerDayPerUser(): number {
  const raw = Number(process.env.WITHDRAWAL_AUTO_SEND_MAX_PER_DAY_PER_USER);
  if (!Number.isFinite(raw) || raw <= 0) return 3;
  return Math.min(50, Math.floor(raw));
}

function hotWalletMinBalancePol(): number {
  const raw = Number(process.env.WITHDRAWAL_HOT_WALLET_MIN_BALANCE_POL);
  if (!Number.isFinite(raw) || raw < 0) return 0.1;
  return raw;
}

function hotWalletCooldownSec(): number {
  const raw = Number(process.env.WITHDRAWAL_HOT_WALLET_RETRY_COOLDOWN_SEC);
  if (!Number.isFinite(raw) || raw < 60) return 1800;
  return Math.min(86_400, Math.floor(raw));
}

/**
 * Computes the total gas buffer for a batch of native transfers.
 * gas_buffer = NATIVE_TRANSFER_GAS * gasPriceWei * count * GAS_PRICE_SAFETY_FACTOR
 * Exported standalone (pure function) so it is directly unit-testable without a live RPC.
 */
export function computeGasBufferWei(gasPriceWei: bigint, count: number): bigint {
  if (count <= 0) return 0n;
  return NATIVE_TRANSFER_GAS * gasPriceWei * BigInt(count) * GAS_PRICE_SAFETY_FACTOR;
}

/** TTL of the Redis lock that prevents multiple containers (app + worker) from ticking at once. */
const AUTO_SEND_LOCK_TTL_MS = 90_000;
const AUTO_SEND_LOCK_KEY = "withdrawals:auto_send_lock";
/** Redis key marking the hot-wallet as "insufficient balance" — the tick early-returns until it expires. */
const HOT_WALLET_COOLDOWN_KEY = "withdrawals:hotwallet_insufficient_until";

/** Compare-and-delete atomic release: only deletes the lock if we're still the owner. */
const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

// --- In-process substitutes, used automatically when Redis is unavailable ---
let _tickInFlight = false;
let _hotWalletCooldownUntilMs = 0;

/**
 * Acquires the tick-level lock. Prefers a real distributed Redis lock (`SET NX PX`, ported
 * from legacy withdrawalsCron.ts) so multiple containers running this cron never tick
 * concurrently; falls back to the in-process `_tickInFlight` flag when Redis is unset or
 * unreachable — safe for the current single-process deployment. Returns a token (or a
 * synthetic one for the in-memory path) that must be passed to releaseAutoSendLock().
 */
export async function acquireAutoSendLock(): Promise<{ token: string | null; viaRedis: boolean }> {
  const redis = getRedis();
  const token = crypto.randomUUID();
  if (!redis) {
    if (_tickInFlight) return { token: null, viaRedis: false };
    _tickInFlight = true;
    return { token, viaRedis: false };
  }
  try {
    const result = await redis.set(AUTO_SEND_LOCK_KEY, token, "PX", AUTO_SEND_LOCK_TTL_MS, "NX");
    return { token: result === "OK" ? token : null, viaRedis: true };
  } catch (err: unknown) {
    log.warn("auto_send Redis lock acquire failed — falling back to in-process lock", { error: String(err) });
    if (_tickInFlight) return { token: null, viaRedis: false };
    _tickInFlight = true;
    return { token, viaRedis: false };
  }
}

export async function releaseAutoSendLock(token: string | null, viaRedis: boolean): Promise<void> {
  if (!token) return;
  if (!viaRedis) {
    _tickInFlight = false;
    return;
  }
  const redis = getRedis();
  if (!redis) {
    _tickInFlight = false;
    return;
  }
  await redis.eval(RELEASE_LOCK_LUA, 1, AUTO_SEND_LOCK_KEY, token).catch((err: unknown) => {
    log.warn("auto_send Redis lock release failed (will expire via TTL)", { error: String(err) });
  });
}

/** Remaining cooldown (ms) if the hot-wallet is marked insufficient, else 0. Redis first, in-process fallback. */
async function getHotWalletCooldownMs(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      const ttl = await redis.pttl(HOT_WALLET_COOLDOWN_KEY);
      if (ttl && ttl > 0) return ttl;
      return 0;
    } catch (err: unknown) {
      log.warn("hot-wallet cooldown Redis read failed — falling back to in-process value", { error: String(err) });
    }
  }
  const remaining = _hotWalletCooldownUntilMs - Date.now();
  return remaining > 0 ? remaining : 0;
}

async function markHotWalletInsufficient(): Promise<void> {
  _hotWalletCooldownUntilMs = Date.now() + hotWalletCooldownSec() * 1000;
  const redis = getRedis();
  if (!redis) return;
  await redis.set(HOT_WALLET_COOLDOWN_KEY, "1", "EX", Math.max(60, hotWalletCooldownSec())).catch((err: unknown) => {
    log.warn("failed to set hot-wallet cooldown flag in Redis (in-process fallback still active)", { error: String(err) });
  });
}

async function clearHotWalletCooldown(): Promise<void> {
  _hotWalletCooldownUntilMs = 0;
  const redis = getRedis();
  if (!redis) return;
  await redis.del(HOT_WALLET_COOLDOWN_KEY).catch(() => {});
}

/** Test-only reset of module-level state between test cases. */
export function resetAutoSendStateForTests(): void {
  _tickInFlight = false;
  _hotWalletCooldownUntilMs = 0;
}

type ApprovedWithdrawal = Awaited<ReturnType<typeof withdrawalRepo.getApprovedWithdrawalsForAutoSend>>[number];

async function evaluateAutoSendGuards(tx: ApprovedWithdrawal): Promise<{ ok: true } | { ok: false; reason: string }> {
  const maxPerDay = autoSendMaxPerDayPerUser();
  const sentToday = await withdrawalRepo.countAutoSentToday(tx.userId).catch((err: unknown) => {
    log.warn(`countAutoSentToday failed for tx ${tx.id} — treating as 0`, { error: String(err) });
    return 0;
  });
  if (sentToday >= maxPerDay) {
    return { ok: false, reason: `daily_limit_reached (${sentToday}/${maxPerDay})` };
  }

  const lastHeartbeatAt = tx.user?.autoMiningLastHeartbeatAt ?? null;
  if (lastHeartbeatAt) {
    const heartbeatAgeMs = Date.now() - new Date(lastHeartbeatAt).getTime();
    if (heartbeatAgeMs < AUTOMINE_HEARTBEAT_RECENT_MS) {
      return { ok: false, reason: `automine_active (heartbeat ${heartbeatAgeMs}ms ago)` };
    }
  }

  return { ok: true };
}

const PRE_BROADCAST_ERROR_CODES = new Set([
  "INSUFFICIENT_FUNDS",
  "INVALID_ARGUMENT",
  "UNSUPPORTED_OPERATION",
  "NUMERIC_FAULT",
  "UNCONFIGURED_NAME",
]);

function isDefinitelyNotBroadcast(err: unknown): boolean {
  const e = err as { code?: unknown; transaction?: { hash?: string } };
  if (e?.transaction?.hash) return false;
  return typeof e?.code === "string" && PRE_BROADCAST_ERROR_CODES.has(e.code);
}

async function recordAutoSendSuccess(tx: ApprovedWithdrawal, via: "hotwallet" | "coinex", txHash: string | null): Promise<void> {
  const withdrawalLike = {
    id: tx.id,
    userId: tx.userId,
    amount: tx.amount,
    address: tx.address,
    txHash,
    status: via === "coinex" ? "processing" : "completed",
    createdAt: tx.createdAt,
    user: tx.user,
  } as Parameters<typeof notifyAutoWithdrawalSent>[0];

  try {
    await notifyAutoWithdrawalSent(withdrawalLike, { via, txHash });
  } catch (err: unknown) {
    log.warn(`notifyAutoWithdrawalSent failed for tx ${tx.id}`, { error: String(err) });
  }

  // Real bug found 12/08/2026 (PROGRESSO.txt item 73): legacy's public-proof post (Telegram
  // TELEGRAM_PUBLIC_PROOF_CHAT_ID) is fired from a generic `updateTransactionStatus` helper
  // (legacy/server/models/walletModel.ts) whenever a withdrawal transitions to `completed`
  // with a real txHash — a call site that never got ported here, so auto-sent withdrawals only
  // ever posted the private alert, never the public proof, even with
  // TELEGRAM_PUBLIC_PROOFS_ENABLED=true. Only fire for a real on-chain completion (hotwallet
  // path with a hash) — the coinex path is still `processing` at this point, not final yet.
  if (via === "hotwallet" && txHash) {
    try {
      await notifyWithdrawalCompleted(withdrawalLike);
    } catch (err: unknown) {
      log.warn(`notifyWithdrawalCompleted failed for tx ${tx.id}`, { error: String(err) });
    }
  }
}

async function handleHotWalletInsufficient(params: {
  balance: bigint;
  required: bigint;
  pendingCount: number;
  reason: "below_min" | "insufficient_for_queue";
}): Promise<void> {
  await markHotWalletInsufficient();
  const alerted = await notifyHotWalletLowBalance({
    balance: ethers.formatEther(params.balance),
    required: ethers.formatEther(params.required),
    pendingCount: params.pendingCount,
  }).catch(() => false);
  log.error(
    `Hot-wallet ${params.reason}: have ${ethers.formatEther(params.balance)} POL, need ${ethers.formatEther(params.required)} POL — telegram_alert=${alerted ? "sent" : "suppressed"}`,
  );
}

/**
 * CoinEx route. Off by default (`WITHDRAWAL_VIA_COINEX` unset). If somehow enabled without
 * `COINEX_ACCESS_ID`/`COINEX_SECRET`, degrades honestly — logs and skips every withdrawal
 * (leaving them `approved` for retry) rather than fabricating a submission.
 */
async function submitViaCoinEx(approved: ApprovedWithdrawal[]): Promise<{ processed: number }> {
  if (!isCoinExConfigured()) {
    log.warn("WITHDRAWAL_VIA_COINEX=1 but COINEX_ACCESS_ID/COINEX_SECRET not configured — skipping tick (safe mode)");
    return { processed: 0 };
  }

  let processed = 0;
  for (const tx of approved) {
    try {
      if (!tx.address) continue;
      const guard = await evaluateAutoSendGuards(tx);
      if (!guard.ok) {
        log.info(`Withdrawal ${tx.id} skipped — ${guard.reason}`);
        continue;
      }
      const claimed = await withdrawalRepo.claimWithdrawalForSend(tx.id);
      if (!claimed) continue;

      const { withdrawId } = await submitCoinExWithdrawal(tx.address, tx.amount.toString(), tx.id);
      const marker = `coinex:${withdrawId}`;
      await withdrawalRepo.markAutoSendCompleted(tx.id, "processing", marker);
      await recordAutoSendSuccess(tx, "coinex", marker);
      processed++;
    } catch (err: unknown) {
      if (err instanceof CoinExNotConfiguredError) {
        await withdrawalRepo.releaseWithdrawalClaim(tx.id);
        log.warn(`CoinEx not configured — withdrawal ${tx.id} requeued`);
        continue;
      }
      await withdrawalRepo.releaseWithdrawalClaim(tx.id);
      log.error(`CoinEx submit failed for withdrawal ${tx.id} — requeued`, { error: String(err) });
    }
  }
  return { processed };
}

/**
 * Hot-wallet route (live path in prod). Returns without touching any withdrawal row when the
 * signing wallet is unconfigured — that is SAFE MODE, the current state of this environment.
 *
 * Approving many withdrawals at once does NOT freeze the system: each row is claimed
 * atomically and sent sequentially. If the hot wallet cannot cover the *entire* queue we
 * still send every withdrawal that fits (largest-first is not used — FIFO from the query),
 * instead of aborting the whole tick (legacy behaviour that looked like a hang when admins
 * approved a batch bigger than the wallet balance).
 */
async function sendViaHotWallet(approved: ApprovedWithdrawal[]): Promise<{ processed: number; skipped: boolean }> {
  const wallet = getWithdrawalHotWallet();
  if (!wallet) {
    log.warn("WITHDRAWAL_AUTO_SEND=1 but WITHDRAWAL_PRIVATE_KEY not configured — SAFE MODE, no sends this tick");
    return { processed: 0, skipped: true };
  }

  const provider = getSharedPolygonProvider();
  const minReserveWei = ethers.parseEther(String(hotWalletMinBalancePol()));

  let gasPriceWei: bigint;
  try {
    const feeData = await provider.getFeeData();
    gasPriceWei = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits("100", "gwei");
  } catch (err: unknown) {
    log.warn("getFeeData failed — using fallback gas price", { error: String(err) });
    gasPriceWei = ethers.parseUnits("100", "gwei");
  }
  const gasPerTxWei = computeGasBufferWei(gasPriceWei, 1);

  let hotBalance: bigint;
  try {
    hotBalance = await provider.getBalance(wallet.address);
  } catch (err: unknown) {
    log.error("Failed to fetch hot-wallet balance — aborting tick", { error: String(err) });
    return { processed: 0, skipped: true };
  }

  if (hotBalance < minReserveWei) {
    await handleHotWalletInsufficient({
      balance: hotBalance,
      required: minReserveWei,
      pendingCount: approved.length,
      reason: "below_min",
    });
    return { processed: 0, skipped: true };
  }

  let processed = 0;
  let skippedForFunds = 0;
  // Running estimate so we do not re-RPC after every send; refreshed on first insufficient miss.
  let availableWei = hotBalance;

  for (const tx of approved) {
    try {
      if (!tx.address) continue;
      const guard = await evaluateAutoSendGuards(tx);
      if (!guard.ok) {
        log.info(`Withdrawal ${tx.id} skipped — ${guard.reason}`);
        continue;
      }

      let amountWei: bigint;
      try {
        amountWei = ethers.parseEther(tx.amount.toString());
      } catch {
        log.warn(`Invalid amount for tx ${tx.id}: ${tx.amount}`);
        continue;
      }

      const needWei = amountWei + gasPerTxWei + minReserveWei;
      if (availableWei < needWei) {
        // Refresh once from chain in case a previous estimate drifted; if still short, skip this
        // row and keep trying smaller later ones in the same tick.
        try {
          availableWei = await provider.getBalance(wallet.address);
        } catch {
          /* keep estimate */
        }
        if (availableWei < needWei) {
          skippedForFunds += 1;
          log.info(`Withdrawal ${tx.id} deferred — hot wallet cannot cover ${ethers.formatEther(amountWei)} POL this tick`, {
            availablePol: ethers.formatEther(availableWei),
            needPol: ethers.formatEther(needWei),
          });
          continue;
        }
      }

      const claimed = await withdrawalRepo.claimWithdrawalForSend(tx.id);
      if (!claimed) continue;

      let hash: string | null = null;
      try {
        // ═══════════════════════════════════════════════════════════════════════════
        // LIVE-SEND PATH — the only place in this module that could broadcast a real
        // transaction. Only reached when WITHDRAWAL_AUTO_SEND=true AND a real, funded
        // WITHDRAWAL_PRIVATE_KEY is configured — neither is true in this dev environment.
        // ═══════════════════════════════════════════════════════════════════════════
        const transactionResponse = await wallet.sendTransaction({ to: tx.address, value: amountWei });
        hash = transactionResponse.hash ?? null;
      } catch (sendErr: unknown) {
        if (isDefinitelyNotBroadcast(sendErr)) {
          await withdrawalRepo.releaseWithdrawalClaim(tx.id);
          log.error(`Auto-send rejected before broadcast for withdrawal ${tx.id} — requeued`, { error: String(sendErr) });
        } else {
          log.error(`Auto-send outcome UNKNOWN for withdrawal ${tx.id} — left in 'processing' for manual review`, { error: String(sendErr) });
        }
        continue;
      }

      await withdrawalRepo.markAutoSendCompleted(tx.id, "completed", hash);
      await recordAutoSendSuccess(tx, "hotwallet", hash);
      processed++;
      // Conservative local debit so the next rows in this tick do not over-commit.
      availableWei = availableWei > amountWei + gasPerTxWei ? availableWei - amountWei - gasPerTxWei : 0n;
    } catch (err: unknown) {
      log.error(`Auto-send failed for withdrawal ${tx.id}`, { error: String(err) });
    }
  }

  if (processed > 0) {
    await clearHotWalletCooldown();
  } else if (skippedForFunds > 0) {
    // Nothing fit — cool down so we do not spam RPC/Telegram every tick.
    await handleHotWalletInsufficient({
      balance: hotBalance,
      required: minReserveWei + gasPerTxWei,
      pendingCount: approved.length,
      reason: "insufficient_for_queue",
    });
  }

  return { processed, skipped: processed === 0 && skippedForFunds > 0 };
}

/**
 * Admin-facing snapshot of the payment (hot) wallet — balance, queue coverage, auto-send flags.
 * Never returns the private key. Address is the derived hot-wallet address when configured.
 */
export async function getHotWalletPaymentStatus(): Promise<{
  configured: boolean;
  autoSendEnabled: boolean;
  globalPause: boolean;
  viaCoinEx: boolean;
  address: string | null;
  balancePol: number | null;
  minReservePol: number;
  cooldownMs: number;
  pendingApprovedCount: number;
  pendingApprovedPol: number;
  canCoverPending: boolean | null;
}> {
  const autoSendEnabled = withdrawalAutoSendEnabled();
  const globalPause = withdrawalGlobalPause();
  const viaCoinEx = withdrawalViaCoinExEnabled();
  const minReservePol = hotWalletMinBalancePol();
  const cooldownMs = await getHotWalletCooldownMs();

  const approved = await withdrawalRepo.getApprovedWithdrawalsForAutoSend().catch(() => []);
  // Include all POL withdrawals (type withdrawal); shib is separate and not paid from POL hot wallet.
  const polApproved = (approved ?? []).filter((t) => t.type !== "shib_withdrawal");
  const pendingApprovedPol = polApproved.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const pendingApprovedCount = polApproved.length;

  const wallet = getWithdrawalHotWallet();
  if (!wallet) {
    return {
      configured: false,
      autoSendEnabled,
      globalPause,
      viaCoinEx,
      address: null,
      balancePol: null,
      minReservePol,
      cooldownMs,
      pendingApprovedCount,
      pendingApprovedPol,
      canCoverPending: null,
    };
  }

  let balancePol: number | null = null;
  let canCoverPending: boolean | null = null;
  try {
    const bal = await getSharedPolygonProvider().getBalance(wallet.address);
    balancePol = Number(ethers.formatEther(bal));
    const feeData = await getSharedPolygonProvider().getFeeData().catch(() => null);
    const gasPriceWei = feeData?.maxFeePerGas ?? feeData?.gasPrice ?? ethers.parseUnits("50", "gwei");
    const gasBuffer = computeGasBufferWei(gasPriceWei, Math.max(1, pendingApprovedCount));
    const need =
      ethers.parseEther(String(pendingApprovedPol || 0)) +
      gasBuffer +
      ethers.parseEther(String(minReservePol));
    canCoverPending = pendingApprovedCount === 0 ? true : bal >= need;
  } catch (err: unknown) {
    log.warn("hot-wallet status balance fetch failed", { error: String(err) });
  }

  return {
    configured: true,
    autoSendEnabled,
    globalPause,
    viaCoinEx,
    address: wallet.address,
    balancePol,
    minReservePol,
    cooldownMs,
    pendingApprovedCount,
    pendingApprovedPol,
    canCoverPending,
  };
}

/**
 * Main tick entry point — call from the cron (withdrawal-auto-send.cron.ts).
 * Manual send remains the default: this is a no-op unless WITHDRAWAL_AUTO_SEND=true.
 */
export async function processPendingWithdrawals(): Promise<{ processed: number; reason?: string }> {
  if (!withdrawalAutoSendEnabled()) return { processed: 0, reason: "auto_send_disabled" };
  if (withdrawalGlobalPause()) {
    log.warn("WITHDRAWAL_AUTO_SEND_GLOBAL_PAUSE=1 — skipping tick");
    return { processed: 0, reason: "global_pause" };
  }

  const cooldownMs = await getHotWalletCooldownMs();
  if (cooldownMs > 0) {
    log.info(`Hot-wallet in cooldown — ${Math.round(cooldownMs / 60_000)}m remaining. Skipping tick.`);
    return { processed: 0, reason: "hot_wallet_cooldown" };
  }

  const { token, viaRedis } = await acquireAutoSendLock();
  if (!token) {
    log.info(`Auto-send tick already in flight — skipping (lock owned elsewhere, via=${viaRedis ? "redis" : "in-process"})`);
    return { processed: 0, reason: "tick_in_flight" };
  }

  try {
    const allApproved = await withdrawalRepo.getApprovedWithdrawalsForAutoSend();
    if (!allApproved?.length) return { processed: 0, reason: "nothing_to_process" };

    const approved = allApproved.slice(0, MAX_WITHDRAWALS_PER_TICK);
    if (allApproved.length > approved.length) {
      log.info(`${allApproved.length} approved; processing ${approved.length} this tick`);
    }

    if (withdrawalViaCoinExEnabled()) {
      const result = await submitViaCoinEx(approved);
      return { processed: result.processed };
    }
    const result = await sendViaHotWallet(approved);
    return { processed: result.processed, reason: result.skipped ? "hot_wallet_skip" : undefined };
  } catch (error: unknown) {
    log.error("processPendingWithdrawals", { error: String(error) });
    return { processed: 0, reason: "error" };
  } finally {
    await releaseAutoSendLock(token, viaRedis);
  }
}

/** Polling of withdrawals sent via CoinEx, waiting for on-chain confirmation. */
export async function pollCoinExWithdrawals(): Promise<void> {
  if (!isCoinExConfigured()) return;
  try {
    const processing = await withdrawalRepo.getProcessingCoinExWithdrawals();
    if (!processing?.length) return;

    for (const tx of processing) {
      try {
        const withdrawId = parseInt(String(tx.txHash).replace("coinex:", ""), 10);
        if (Number.isNaN(withdrawId)) {
          log.error(`Withdrawal ${tx.id} has invalid coinex marker: ${tx.txHash}`);
          continue;
        }
        const { txHash, status } = await getCoinExWithdrawalStatus(withdrawId);
        log.info(`CoinEx withdrawId=${withdrawId} (tx ${tx.id}): status=${status} txHash=${txHash ?? "pending"}`);
        if (status === "done" && txHash) {
          await withdrawalRepo.markAutoSendCompleted(tx.id, "completed", txHash);
        } else if (status === "cancel") {
          await withdrawalRepo.markAutoSendFailed(tx.id);
          log.warn(`Withdrawal ${tx.id} cancelled by CoinEx.`);
        }
      } catch (err: unknown) {
        log.error(`CoinEx poll failed for withdrawal ${tx.id}`, { error: String(err) });
      }
    }
  } catch (error: unknown) {
    log.error("pollCoinExWithdrawals", { error: String(error) });
  }
}
