/** Public surface of the mining module — the only import path other modules may use. */
export { miningRouter } from "./mining.routes.js";
export { miningAdminRouter } from "./mining.admin.routes.js";

export { engine as miningEngine, bootstrapEngine, getOrCreateEngineMinerForUser, runEngineTick, syncUserBaseHashRate } from "./mining.service.js";

export { ALLOCATION_BPS_MAX, normalizeAllocationBps } from "./mining.engine.js";

/** BLK reward-cycle distribution engine — public so stats/ can read snapshots. */
export { runBlkRewardCycle, getLatestBlkRewardCycle, getBlkCyclePublicSnapshot } from "./mining.blk-cycle.js";
export type { BlkRewardCycleOptions, BlkRewardCycleResult, BlkCyclePublicSnapshot } from "./mining.blk-cycle.js";

export type { EngineMiner, MinerRewardRow, PersistBlockRewardsPayload } from "./mining.types.js";

/** Realtime — consumed only by core/socket/index.ts to register this module's socket handlers. */
export { registerMiningSocketHandlers } from "./mining.socket.js";
