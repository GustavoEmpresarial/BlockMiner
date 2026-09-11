/**
 * Wallet snapshot cron — ported from legacy/server/cron/walletSnapshotCron.ts. For every
 * public tracked wallet (`display_mode: "current_balance"`, no manual USD override), triggers a
 * real multi-chain on-chain snapshot + LP-position sync via
 * `transparency/transparency.wallet-snapshot.service.ts:syncWalletSnapshot`. Read-only: no
 * signing, no fund movement.
 *
 * `setInterval`-based per doctrine (same shape as deposit-verifier.cron.ts), NOT node-cron. Per
 * docs/ARQUITETURA.md section 9 ("cron agenda, não deveria conter regra de negócio"), this file
 * only lists eligible wallets and loops — all snapshot/reconciliation logic lives in the
 * transparency module (moved there after a code review flagged it as business logic that had
 * leaked into cron/).
 *
 * Deviation from legacy: legacy also supported a `total_received`/`total_sent` display mode
 * backed by `fetchTrackedWalletsLive` (Etherscan-based). That mode is out of scope here — see
 * transparency.controller.ts's existing doc-comment on `getPublicTrackedWalletsLive`. This
 * cron only handles `current_balance` wallets (multi-chain RPC snapshot); wallets configured
 * with another display mode are silently skipped (existing snapshot rows, if any, are left
 * untouched — never overwritten with fabricated data).
 */
import { logger } from "../core/logger/index.js";
import * as transparencyRepo from "../modules/transparency/transparency.repository.js";
import { syncWalletSnapshot } from "../modules/transparency/transparency.wallet-snapshot.service.js";

const log = logger.child("WalletSnapshotCron");

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 min, matches legacy's default
const STARTUP_DELAY_MS = 20_000; // gives DB/pool time to warm up

let running = false;

export async function runWalletSnapshot(): Promise<void> {
  if (running) {
    log.info("Snapshot run already in progress — skipped");
    return;
  }
  running = true;
  const started = Date.now();
  log.info("Starting multi-chain wallet snapshot run");

  try {
    const wallets = await transparencyRepo.listSnapshotEligibleWallets();
    if (!wallets.length) {
      log.info("No public snapshot-eligible wallets configured");
      return;
    }

    for (const wallet of wallets) {
      if (wallet.displayMode !== "current_balance") continue; // see module doc-comment
      try {
        const snap = await syncWalletSnapshot(wallet);
        log.info("Wallet snapshot done", {
          address: wallet.address,
          totalUsd: snap.totalUsd,
          chains: snap.chains.map((c) => c.name),
        });
      } catch (err) {
        log.error("Wallet snapshot failed", { address: wallet.address, error: err instanceof Error ? err.message : String(err) });
      }
    }
  } finally {
    running = false;
    log.info("Wallet snapshot run complete", { elapsedSec: ((Date.now() - started) / 1000).toFixed(1) });
  }
}

export function startWalletSnapshotCron(): { stop: () => void } {
  const intervalMs = Number(process.env.WALLET_SNAPSHOT_CRON_MS || DEFAULT_INTERVAL_MS);

  const startupTimer = setTimeout(() => {
    void runWalletSnapshot();
  }, STARTUP_DELAY_MS);
  startupTimer.unref?.();

  const intervalTimer = setInterval(() => {
    void runWalletSnapshot();
  }, intervalMs);
  intervalTimer.unref?.();

  log.info("Wallet snapshot cron scheduled", { intervalMinutes: intervalMs / 60000, startupDelaySec: STARTUP_DELAY_MS / 1000 });

  return {
    stop: () => {
      clearTimeout(startupTimer);
      clearInterval(intervalTimer);
    },
  };
}
