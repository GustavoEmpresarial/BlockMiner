import { randomUUID } from "node:crypto";
import { logger as rootLogger } from "../../core/logger/index.js";
import {
  ALLOCATION_BPS_MAX,
  readMiningBlockRewardPol,
  readMiningBlockRewardShib,
  normalizeAllocationBps,
  readMiningBlockDurationMs,
  nextAlignedBoundary,
  isDuplicateBlockError,
  readBoundedIntegerEnv,
} from "./mining.config.js";
import type {
  EngineMiner,
  BlockHistoryEntry,
  MinerRewardRow,
  PersistBlockRewardsPayload,
  CreateOrGetMinerInput,
  SetAllocationOutcome,
  ApplyOutcome,
} from "./mining.types.js";

const logger = rootLogger.child("MiningEngine");

export {
  ALLOCATION_BPS_MAX,
  readMiningBlockRewardPol,
  readMiningBlockRewardShib,
  normalizeAllocationBps,
  readMiningBlockDurationMs,
  nextAlignedBoundary,
};

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Faithful port of legacy/server/src/miningEngine.ts (MiningEngine class).
 *
 * DEVIATION FROM LEGACY: this port drops all Socket.IO broadcasting (`this.io`,
 * `sanitizePublicStateForSocket`, `emit(...)`). `core/socket/` does not exist yet in this phase.
 * `getPublicState()` remains the read-only state snapshot for polling (GET /mining/cycle);
 * `reloadMinerProfile` no longer emits `state:update` / `machines:update` / `inventory:update` —
 * callers must poll instead. See README.md "Socket deviation" section.
 */
export class MiningEngine {
  tokenSymbol!: string;
  blockNumber!: number;
  rewardBase!: number;
  /** SHIB minted per block (shared by all hashrate allocated to SHIB pool). */
  rewardBaseShib!: number;
  blockTarget!: number;
  blockProgress!: number;
  blockDurationMs!: number;
  blockStartedAt!: number;
  nextBlockAt!: number;
  tokenPrice!: number;
  totalMinted!: number;
  lastReward!: number;
  roundWork!: Map<string, number>;
  miners!: Map<string, EngineMiner>;
  minersByUserId!: Map<number, EngineMiner>;
  lastBlockAt!: number;
  activeMiners!: number;
  currentNetworkHashRate!: number;
  blockHistory!: BlockHistoryEntry[];
  leaderboardCache!: unknown[];
  leaderboardCacheDirty!: boolean;
  logRewardCallback!: ((payload: Record<string, unknown>) => void) | null;
  persistBlockRewardsCallback!: ((payload: PersistBlockRewardsPayload) => Promise<void>) | null;
  /** Serialises background settlements: exactly one DB write in flight at any time. */
  _settleChain!: Promise<void>;
  profileLoader!: ((userId: number) => Promise<Record<string, unknown> | null>) | null;

  constructor() {
    this.tokenSymbol = "POL";
    this.blockNumber = 1;
    this.rewardBase = readMiningBlockRewardPol();
    this.rewardBaseShib = readMiningBlockRewardShib();
    this.blockTarget = 100;
    this.blockProgress = 0;
    this.blockDurationMs = readMiningBlockDurationMs();
    this.blockStartedAt = Date.now();
    this.nextBlockAt = nextAlignedBoundary(this.blockStartedAt, this.blockDurationMs);
    this.tokenPrice = 0.35;
    this.totalMinted = 0;
    this.lastReward = 0;
    this.roundWork = new Map();
    this.miners = new Map();
    this.minersByUserId = new Map();
    this.lastBlockAt = Date.now();
    this.activeMiners = 0;
    this.currentNetworkHashRate = 0;
    this.blockHistory = [];
    this.leaderboardCache = [];
    this.leaderboardCacheDirty = true;
    this.logRewardCallback = null;
    this.persistBlockRewardsCallback = null;
    this._settleChain = Promise.resolve();
    this.profileLoader = null;

    if (process.env.NODE_ENV === "production") {
      logger.info("Mining block economy", {
        rewardBasePol: this.rewardBase,
        rewardBaseShib: this.rewardBaseShib,
        blockIntervalMinutes: this.blockDurationMs / 60000,
      });
    }
  }

  setRewardLogger(callback: (payload: Record<string, unknown>) => void): void {
    this.logRewardCallback = callback;
  }

  setPersistBlockRewardsCallback(callback: (payload: PersistBlockRewardsPayload) => Promise<void>): void {
    this.persistBlockRewardsCallback = callback;
  }

  setProfileLoader(loader: (userId: number) => Promise<Record<string, unknown> | null>): void {
    this.profileLoader = loader;
  }

  markLeaderboardDirty(): void {
    this.leaderboardCacheDirty = true;
  }

  /**
   * NOTE (socket deviation): legacy also emitted `state:update` / `machines:update` /
   * `inventory:update` here via `this.io`. That's dropped — callers relying on realtime
   * updates must poll `getPublicState()` (GET /mining/cycle) until core/socket/ lands.
   */
  async reloadMinerProfile(
    userId: number,
    { forceBalanceSync = false }: { forceBalanceSync?: boolean } = {},
  ): Promise<void> {
    if (this.profileLoader) {
      const profile = await this.profileLoader(userId);
      if (profile) {
        const p = profile as Record<string, unknown>;
        const miner = this.findMinerByUserId(userId);
        if (miner) {
          miner.rigs = Number(p.rigs || 1);
          miner.baseHashRate = Number(p.base_hash_rate || 0);
          miner.refCode = (p.refCode as string | null | undefined) ?? null;
          miner.referralCount = Number(p.referralCount || 0);
          miner.miningPayoutMode =
            p.mining_payout_mode === "blk" || p.miningPayoutMode === "blk" ? "blk" : "pol";
          const rawAlloc = p.mining_allocation_pol_bps ?? p.miningAllocationPolBps;
          if (rawAlloc != null) miner.miningAllocationPolBps = normalizeAllocationBps(rawAlloc);
          const rawShib = p.shib_balance ?? p.shibBalance;
          if (rawShib != null) miner.shibBalance = Number(rawShib) || 0;
          // Sincroniza saldo:
          // - modo forçado: espelha o banco 1:1 (após mutações explícitas de saldo).
          // - modo normal: espelha o banco somando de volta o delta ainda-não-persistido
          //   (rewards do bloco corrente). Antes o modo normal era "só sobe" (`db > balance`),
          //   um high-water mark que travava o engine no valor antigo quando o DB baixava por um
          //   gasto — causando o "pisca e volta" no dashboard. Agora converge nas duas direções.
          const dbBalance = Number(p.balance || 0);
          if (Number.isFinite(dbBalance)) {
            if (forceBalanceSync) {
              miner.balance = dbBalance;
              miner.lastPersistedBalance = dbBalance;
            } else {
              const pendingReward = miner.balance - (miner.lastPersistedBalance ?? miner.balance);
              miner.balance = dbBalance + (pendingReward > 0 ? pendingReward : 0);
              miner.lastPersistedBalance = dbBalance;
            }
          }
          this.markLeaderboardDirty();
        }
      }
    }
  }

  findMinerByUserId(userId: number): EngineMiner | null {
    if (!userId) return null;
    return this.minersByUserId.get(userId) ?? null;
  }

  createOrGetMiner({ userId, username, walletAddress, profile }: CreateOrGetMinerInput): EngineMiner {
    const existing = this.findMinerByUserId(userId);
    if (existing) {
      if (username) existing.username = username;
      if (walletAddress) existing.walletAddress = walletAddress;
      if (profile) {
        existing.rigs = Number(profile.rigs || 1);
        existing.baseHashRate = Number(profile.base_hash_rate || profile.baseHashRate || 0);
        existing.refCode = profile.refCode ?? null;
        existing.referralCount = profile.referralCount ?? 0;
        existing.miningPayoutMode =
          profile.mining_payout_mode === "blk" || profile.miningPayoutMode === "blk" ? "blk" : "pol";
        const rawAlloc = profile.mining_allocation_pol_bps ?? profile.miningAllocationPolBps;
        if (rawAlloc != null) existing.miningAllocationPolBps = normalizeAllocationBps(rawAlloc);
        const rawShib = profile.shib_balance ?? profile.shibBalance;
        if (rawShib != null) existing.shibBalance = Number(rawShib) || 0;
        // Sincroniza saldo com o banco ao reconectar. O DB (`pol_balance`) é a verdade dos fundos
        // liquidados; o engine carrega, além disso, o delta ainda-não-persistido (rewards do bloco
        // corrente). Antes isto usava `max(db, engine)` — um high-water mark que se RECUSAVA a
        // descer, então qualquer gasto que baixasse o DB deixava o engine preso no valor antigo e o
        // dashboard "piscava e voltava" pro saldo antigo. Agora espelhamos o DB somando de volta o
        // delta não-persistido, corrigindo tanto para baixo (gasto) quanto para cima (crédito) sem
        // perder rewards em memória.
        const dbBalance = Number(profile.balance || 0);
        if (Number.isFinite(dbBalance)) {
          const pendingReward = existing.balance - (existing.lastPersistedBalance ?? existing.balance);
          existing.balance = dbBalance + (pendingReward > 0 ? pendingReward : 0);
          existing.lastPersistedBalance = dbBalance;
        }
      }
      this.markLeaderboardDirty();
      return existing;
    }

    const id = randomUUID();
    const miner: EngineMiner = {
      id,
      userId,
      walletAddress: walletAddress || null,
      username: username || `Miner-${id.slice(0, 5)}`,
      rigs: Number(profile?.rigs || 1),
      baseHashRate: Number(profile?.base_hash_rate || profile?.baseHashRate || 0),
      active: true,
      boostMultiplier: 1,
      boostEndsAt: 0,
      balance: Number(profile?.balance || 0),
      lastPersistedBalance: Number(profile?.balance || 0),
      lifetimeMined: Number(profile?.lifetimeMined || 0),
      connected: true,
      refCode: profile?.refCode ?? null,
      referralCount: profile?.referralCount ?? 0,
      miningPayoutMode:
        profile?.mining_payout_mode === "blk" || profile?.miningPayoutMode === "blk" ? "blk" : "pol",
      miningAllocationPolBps: normalizeAllocationBps(
        profile?.mining_allocation_pol_bps ?? profile?.miningAllocationPolBps ?? ALLOCATION_BPS_MAX,
      ),
      lifetimeMinedShib: 0,
      lastShibReward: 0,
      shibBalance: Number(profile?.shib_balance ?? profile?.shibBalance ?? 0),
    };

    this.miners.set(id, miner);
    this.minersByUserId.set(userId, miner);
    this.roundWork.set(id, 0);
    this.markLeaderboardDirty();
    return miner;
  }

  setConnected(minerId: string, connected: boolean): void {
    const miner = this.miners.get(minerId);
    if (!miner) return;
    miner.connected = connected;
  }

  setActive(minerId: string, active: boolean): EngineMiner | null {
    const miner = this.miners.get(minerId);
    if (!miner) return null;
    miner.active = !!active;
    this.markLeaderboardDirty();
    return miner;
  }

  setWallet(minerId: string, walletAddress: string | null): EngineMiner | null {
    const miner = this.miners.get(minerId);
    if (!miner) return null;
    miner.walletAddress = walletAddress || null;
    return miner;
  }

  /**
   * Live-set the miner's POL/SHIB hashrate allocation. Takes effect on the NEXT settled block —
   * accumulated work for the current round still uses whatever split each miner had when ticks ran.
   * Caller is responsible for persisting to the DB; this just mutates the in-memory engine.
   */
  setMinerAllocation(minerId: string, rawBps: unknown): SetAllocationOutcome {
    const miner = this.miners.get(minerId);
    if (!miner) return { ok: false, message: "Miner não encontrado." };
    const normalized = normalizeAllocationBps(rawBps);
    miner.miningAllocationPolBps = normalized;
    this.markLeaderboardDirty();
    return { ok: true, polBps: normalized, shibBps: ALLOCATION_BPS_MAX - normalized };
  }

  applyBoost(minerId: string): ApplyOutcome {
    const miner = this.miners.get(minerId);
    if (!miner) return { ok: false, message: "Miner não encontrado." };

    const boostCost = 0.35;
    if (miner.balance < boostCost) {
      return { ok: false, message: "Saldo insuficiente para boost." };
    }

    miner.balance -= boostCost;
    miner.boostMultiplier = 1.25;
    miner.boostEndsAt = Date.now() + 30000;
    this.markLeaderboardDirty();

    return { ok: true, message: "Boost ativado por 30s." };
  }

  upgradeRig(minerId: string): ApplyOutcome {
    const miner = this.miners.get(minerId);
    if (!miner) return { ok: false, message: "Miner não encontrado." };

    const rigCost = 2 + (miner.rigs - 1) * 0.8;
    if (miner.balance < rigCost) {
      return { ok: false, message: `Você precisa de ${rigCost.toFixed(2)} ${this.tokenSymbol}.` };
    }

    miner.balance -= rigCost;
    miner.rigs += 1;
    miner.baseHashRate += 18;
    this.markLeaderboardDirty();

    return { ok: true, message: `Rig #${miner.rigs} comprado com sucesso.` };
  }

  getMinerHashRate(miner: EngineMiner): number {
    if (!miner.active) return 0;
    return miner.baseHashRate * miner.boostMultiplier;
  }

  /**
   * Settles the current block (dual-pool: POL + SHIB on the same cadence). Each miner's raw
   * accumulated `work` is split by their `miningAllocationPolBps` snapshot at settle time:
   *   workPol = work * (bps / ALLOCATION_BPS_MAX)
   *   workShib = work - workPol
   * Then `totalWorkPol` and `totalWorkShib` are computed independently, and each pool's reward
   * is shared in proportion to that pool's contributing work.
   *
   * Runs to completion SYNCHRONOUSLY: the round's work is snapshotted and cleared, balances are
   * credited in memory, and the clock advances to the next wall-clock boundary — all before the
   * database write, which is handed to a serialised background queue. That is what keeps blocks
   * landing exactly on :00/:10/:20/:30/:40/:50 regardless of how long Postgres takes, and it is
   * why no accumulation freeze is needed any more: the next round starts accruing immediately.
   */
  distributeRewards(): void {
    const _syncStart = Date.now();
    const minedBlockNumber = this.blockNumber;
    const roundSnapshot = new Map(this.roundWork);
    const totalWork = [...roundSnapshot.values()].reduce((sum, value) => sum + value, 0);

    // Clear the window NOW, before anything can await. Previously this happened after the DB
    // write, which forced settlement to freeze round work while waiting on Postgres and
    // silently discarded every second of work spent waiting.
    for (const minerId of roundSnapshot.keys()) {
      if (this.miners.has(minerId)) this.roundWork.set(minerId, 0);
      else this.roundWork.delete(minerId); // miner gone: drop the key instead of leaking it
    }

    const blockReward = this.rewardBase;
    const blockRewardShib = this.rewardBaseShib;

    // Snapshot per-miner work split now — allocation changes mid-block don't retroactively shift this round.
    type Split = { work: number; workPol: number; workShib: number; allocBps: number };
    const splitByMiner = new Map<string, Split>();
    let totalWorkPol = 0;
    let totalWorkShib = 0;
    for (const [minerId, work] of roundSnapshot.entries()) {
      const miner = this.miners.get(minerId);
      if (!miner || work <= 0) continue;
      const allocBps = normalizeAllocationBps(miner.miningAllocationPolBps);
      const polFactor = allocBps / ALLOCATION_BPS_MAX;
      const workPol = work * polFactor;
      const workShib = work - workPol;
      splitByMiner.set(minerId, { work, workPol, workShib, allocBps });
      totalWorkPol += workPol;
      totalWorkShib += workShib;
    }

    if (totalWork <= 0) {
      if (this.activeMiners > 0 || this.currentNetworkHashRate > 0) {
        logger.warn("Block closed with zero accumulated work while miners report hashrate", {
          blockNumber: minedBlockNumber,
          activeMiners: this.activeMiners,
          networkHashRate: this.currentNetworkHashRate,
        });
      }
      this.lastReward = 0; // work was already cleared above
      this.blockHistory.unshift({
        blockNumber: minedBlockNumber,
        reward: 0,
        rewardShib: 0,
        minerCount: this.activeMiners,
        timestamp: Date.now(),
        userRewards: {},
        userRewardsShib: {},
      });
      if (this.blockHistory.length > 12) this.blockHistory.length = 12;
      this.finalizeBlockDistribution(minedBlockNumber, 0);
      return;
    }

    const minerRewards: MinerRewardRow[] = [];
    const userRewardsMap: Record<number, number> = {};
    const userRewardsShibMap: Record<number, number> = {};

    for (const [minerId, split] of splitByMiner.entries()) {
      const miner = this.miners.get(minerId);
      if (!miner) continue;

      const share = split.work / totalWork;
      const sharePol = totalWorkPol > 0 ? split.workPol / totalWorkPol : 0;
      const shareShib = totalWorkShib > 0 ? split.workShib / totalWorkShib : 0;

      const rewardPol = blockReward * sharePol;
      const rewardShib = blockRewardShib * shareShib;

      // POL is the in-engine live balance — keep current behavior.
      miner.balance += rewardPol;
      miner.lastPersistedBalance = (miner.lastPersistedBalance ?? miner.balance - rewardPol) + rewardPol;
      miner.lifetimeMined += rewardPol;
      this.totalMinted += rewardPol;
      // SHIB lifetime is engine-session-scoped (informational); the authoritative balance is `User.shibBalance`.
      miner.lifetimeMinedShib = (miner.lifetimeMinedShib ?? 0) + rewardShib;
      miner.lastShibReward = rewardShib;
      // Optimistically update the cached SHIB balance; persistBlockRewards will increment the DB row to match.
      miner.shibBalance = (miner.shibBalance ?? 0) + rewardShib;

      userRewardsMap[miner.userId] = rewardPol;
      userRewardsShibMap[miner.userId] = rewardShib;

      minerRewards.push({
        minerId: miner.id,
        userId: miner.userId,
        username: miner.username,
        walletAddress: miner.walletAddress,
        rigs: miner.rigs,
        baseHashRate: miner.baseHashRate,
        workAccumulated: split.work,
        sharePercentage: share * 100,
        rewardAmount: rewardPol,
        balanceAfter: miner.balance,
        lifetimeMined: miner.lifetimeMined,
        workPol: split.workPol,
        workShib: split.workShib,
        shareShibPercentage: shareShib * 100,
        allocationPolBps: split.allocBps,
        rewardAmountShib: rewardShib,
      });
    }

    const now = Date.now();
    if (minerRewards.length === 0 || !this.persistBlockRewardsCallback) {
      // Falling through to the success path here would clear the round's work and record a
      // fully-rewarded block in history while writing NOTHING to the database, with no log
      // line to show for it. Surface it instead — it means work was accumulated for miner
      // ids that no longer exist in `this.miners`, or that the persistence callback was
      // never registered.
      logger.error("Block produced no persistable rewards — nothing was written", {
        blockNumber: minedBlockNumber,
        totalWork,
        minerRewards: minerRewards.length,
        hasPersistCallback: Boolean(this.persistBlockRewardsCallback),
      });
    }
    this.blockHistory.unshift({
      blockNumber: minedBlockNumber,
      reward: blockReward,
      rewardShib: blockRewardShib,
      minerCount: this.activeMiners,
      timestamp: Date.now(),
      userRewards: userRewardsMap,
      userRewardsShib: userRewardsShibMap,
    });
    if (this.blockHistory.length > 12) this.blockHistory.length = 12;

    this.lastReward = blockReward;
    this.markLeaderboardDirty();
    // Advance the clock BEFORE handing the write off. With the write moved off the tick it
    // can no longer serialise settlements, so the schedule must move here and `_settleChain`
    // takes over serialisation.
    this.finalizeBlockDistribution(minedBlockNumber, blockReward);

    if (minerRewards.length > 0 && this.persistBlockRewardsCallback) {
      this.enqueueSettlement({
        blockNumber: minedBlockNumber,
        blockReward,
        blockRewardShib,
        totalWork,
        totalWorkPol,
        totalWorkShib,
        minerRewards,
        now,
      });
    }

    // Synchronous portion of settlement — this runs on the event loop and blocks
    // every request while it executes. If it grows into hundreds of ms with the
    // miner count, it is a prime suspect for periodic mass-timeout stalls.
    const _syncMs = Date.now() - _syncStart;
    if (_syncMs >= 100) {
      logger.warn("settlement_sync_slow", {
        blockNumber: minedBlockNumber,
        syncMs: _syncMs,
        miners: minerRewards.length,
        totalWork,
      });
    }
  }

  /**
   * Queues a block's database write. Settlements run strictly one at a time: two concurrent
   * writes would re-read work already paid, collide on the unique `blockNumber`, and cross
   * their rollback snapshots.
   */
  enqueueSettlement(payload: PersistBlockRewardsPayload): void {
    this._settleChain = this._settleChain
      .then(() => this.persistSettlement(payload))
      .catch((error: unknown) => {
        // Never let a rejection break the chain — a broken chain would silently stop every
        // later block from ever being written.
        logger.error("Settlement queue error", {
          blockNumber: payload.blockNumber,
          error: errMsg(error),
        });
      });
  }

  /** Resolves once every queued settlement has finished. For tests and graceful shutdown. */
  async drainSettlements(): Promise<void> {
    for (;;) {
      const pending = this._settleChain;
      await pending;
      if (pending === this._settleChain) return;
    }
  }

  /** Writes one settled block, retrying until it lands or the budget runs out. */
  async persistSettlement(payload: PersistBlockRewardsPayload): Promise<void> {
    if (!this.persistBlockRewardsCallback) return;
    const { blockNumber: minedBlockNumber, minerRewards } = payload;

    const persistMaxAttempts = readBoundedIntegerEnv("MINING_BLOCK_PERSIST_MAX_ATTEMPTS", 12, 1, 30);
    const retryBaseMs = readBoundedIntegerEnv("MINING_BLOCK_PERSIST_RETRY_BASE_MS", 220, 80, 8000);
    let persistError: unknown | null = null;
    for (let attempt = 1; attempt <= persistMaxAttempts; attempt += 1) {
      const _writeStart = Date.now();
      const writePromise = this.persistBlockRewardsCallback(payload);
      try {
        // Awaiting the same promise here is intentional: retrying before it settles could
        // overlap writes.
        await writePromise;
        persistError = null;
        // The DB write holds a pooled connection for this whole span. A slow one during
        // peak traffic starves every other query → mass timeouts.
        const _writeMs = Date.now() - _writeStart;
        if (_writeMs >= 1000) {
          logger.warn("settlement_write_slow", {
            blockNumber: minedBlockNumber,
            writeMs: _writeMs,
            miners: minerRewards.length,
            attempt,
          });
        }
        break;
      } catch (error: unknown) {
        // `block_distributions.block_number` is unique, so a duplicate means a previous
        // attempt actually committed and we only lost the acknowledgement. Treat it as the
        // success it is, or the retry would trigger a rollback of already-paid rewards.
        if (isDuplicateBlockError(error)) {
          logger.warn("Block already persisted — treating retry as success", {
            blockNumber: minedBlockNumber,
            attempt,
          });
          persistError = null;
          break;
        }
        if ((error as { code?: unknown } | null)?.code === "40P01") {
          logger.warn("Settlement deadlock detected — retrying transaction", {
            blockNumber: minedBlockNumber,
            attempt,
          });
        }
        persistError = error;
        logger.warn("Block reward persistence attempt failed", {
          attempt,
          maxAttempts: persistMaxAttempts,
          blockNumber: minedBlockNumber,
          error: errMsg(error),
        });
        if (attempt < persistMaxAttempts) {
          // Jitter: a fixed backoff makes every retry re-collide with the same competing
          // transaction at the same offset, so all attempts fail the same way.
          const base = Math.min(15_000, Math.round(retryBaseMs * attempt ** 1.35));
          const delay = base + Math.floor(Math.random() * base);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    if (!persistError) return;

    logger.error("Block reward persistence failed — rolling back in-memory rewards", {
      error: errMsg(persistError),
      blockNumber: minedBlockNumber,
    });
    // Subtract this block's own delta rather than restoring an absolute snapshot: by the time
    // a background settlement gives up, later blocks and ordinary user activity have already
    // moved these balances, and an absolute restore would wipe those out too.
    for (const rewardEntry of minerRewards) {
      const miner = this.miners.get(rewardEntry.minerId);
      if (!miner) continue;
      const rewardPol = rewardEntry.rewardAmount ?? 0;
      const rewardShib = rewardEntry.rewardAmountShib ?? 0;
      miner.balance -= rewardPol;
      miner.lifetimeMined -= rewardPol;
      miner.lastPersistedBalance = (miner.lastPersistedBalance ?? 0) - rewardPol;
      miner.lifetimeMinedShib = (miner.lifetimeMinedShib ?? 0) - rewardShib;
      miner.shibBalance = (miner.shibBalance ?? 0) - rewardShib;
      this.totalMinted -= rewardPol;
    }
    const historyEntry = this.blockHistory.find((b) => b.blockNumber === minedBlockNumber);
    if (historyEntry) {
      historyEntry.persistFailed = true;
      historyEntry.userRewards = {};
      historyEntry.userRewardsShib = {};
    }
    this.markLeaderboardDirty();
  }

  finalizeBlockDistribution(_num: number, _reward: number): void {
    this.blockNumber += 1;
    this.blockProgress = 0;
    this.lastBlockAt = Date.now();
    this.blockStartedAt = this.lastBlockAt;
    // Anchored to the wall clock instead of `blockStartedAt + duration`, which compounded the
    // settle latency into every period and drifted the schedule.
    this.nextBlockAt = nextAlignedBoundary(this.lastBlockAt, this.blockDurationMs);
  }

  async tickAsync(): Promise<void> {
    const now = Date.now();
    let totalHashRate = 0;
    let activeMiners = 0;
    let leaderboardChanged = false;

    for (const [minerId, miner] of this.miners.entries()) {
      if (miner.boostEndsAt > 0 && now >= miner.boostEndsAt) {
        miner.boostMultiplier = 1;
        miner.boostEndsAt = 0;
        leaderboardChanged = true;
      }
      const hashRate = this.getMinerHashRate(miner);
      totalHashRate += hashRate;
      if (hashRate > 0) activeMiners += 1;
      // Recompensa por bloco é só POL hoje; modo BLK no perfil ainda não desvia mint por bloco.
      // Todos acumulam work no pool POL para o bloco não ficar "morto" quando alguém escolheu BLK na UI.
      this.roundWork.set(minerId, (this.roundWork.get(minerId) || 0) + hashRate);
    }

    if (leaderboardChanged) {
      this.markLeaderboardDirty();
    }

    this.currentNetworkHashRate = totalHashRate;
    this.activeMiners = activeMiners;

    if (Date.now() >= this.nextBlockAt) {
      this.distributeRewards();
    }

    const elapsed = Math.max(0, Date.now() - this.blockStartedAt);
    // Against the real window, not the nominal interval: the first block after a restart is
    // shorter than `blockDurationMs` because the clock snaps to the next boundary.
    const windowMs = Math.max(1, this.nextBlockAt - this.blockStartedAt);
    this.blockProgress = Math.min(this.blockTarget, (elapsed / windowMs) * this.blockTarget);
  }

  getLeaderboard(limit = 10): unknown[] {
    if (this.leaderboardCacheDirty) {
      this.leaderboardCache = [...this.miners.values()]
        .map((m) => ({
          id: m.id,
          username: m.username,
          rigs: m.rigs,
          active: m.active,
          lifetimeMined: m.lifetimeMined,
          currentHashRate: this.getMinerHashRate(m),
        }))
        .sort((a, b) => b.lifetimeMined - a.lifetimeMined);
      this.leaderboardCacheDirty = false;
    }
    return this.leaderboardCache.slice(0, limit);
  }

  /** Read-only public state snapshot — used for polling (GET /mining/cycle) in lieu of sockets. */
  getPublicState(minerId?: unknown, options: { includeLeaderboard?: boolean } = {}) {
    const includeLeaderboard = Boolean(options.includeLeaderboard);
    const key = minerId == null || minerId === "" ? null : String(minerId);
    const miner = key ? this.miners.get(key) : null;
    const userId = miner?.userId;
    const remainingMs = Math.max(0, this.nextBlockAt - Date.now());

    const customizedHistory = this.blockHistory.map((b: BlockHistoryEntry) => ({
      blockNumber: b.blockNumber,
      totalReward: b.reward,
      totalRewardShib: b.rewardShib ?? 0,
      userReward: userId ? b.userRewards?.[userId] || 0 : 0,
      userRewardShib: userId ? b.userRewardsShib?.[userId] || 0 : 0,
      minerCount: b.minerCount,
      timestamp: b.timestamp,
      persistFailed: Boolean(b.persistFailed),
    }));

    return {
      serverTime: Date.now(),
      tokenSymbol: this.tokenSymbol,
      tokenPrice: this.tokenPrice,
      blockReward: this.rewardBase,
      blockRewardShib: this.rewardBaseShib,
      /** Minutes between POL block settlements (for calculator / UI). */
      blockIntervalMinutes: this.blockDurationMs / 60000,
      blockNumber: this.blockNumber,
      blockProgress: this.blockProgress,
      blockCountdownSeconds: Math.ceil(remainingMs / 1000),
      totalMiners: this.miners.size,
      activeMiners: this.activeMiners,
      networkHashRate: this.currentNetworkHashRate,
      totalMinted: this.totalMinted,
      lastReward: this.lastReward,
      blockHistory: customizedHistory,
      ...(includeLeaderboard ? { leaderboard: this.getLeaderboard() } : {}),
      miner: miner
        ? {
            id: miner.id,
            username: miner.username,
            walletAddress: miner.walletAddress,
            rigs: miner.rigs,
            active: miner.active,
            balance: miner.balance,
            lifetimeMined: miner.lifetimeMined,
            connected: miner.connected,
            estimatedHashRate: this.getMinerHashRate(miner),
            refCode: miner.refCode || null,
            referralCount: miner.referralCount || 0,
            miningAllocationPolBps: normalizeAllocationBps(miner.miningAllocationPolBps),
            lastShibReward: miner.lastShibReward ?? 0,
            lifetimeMinedShib: miner.lifetimeMinedShib ?? 0,
            shibBalance: miner.shibBalance ?? 0,
          }
        : null,
    };
  }
}
