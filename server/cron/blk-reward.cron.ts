/**
 * BLK reward-cycle cron — runs `runBlkRewardCycle` on a fixed poll interval.
 * Idempotent per UTC window bucket (see mining.blk-cycle.ts); safe to poll faster than the
 * configured cycle interval.
 */
import { logger } from "../core/logger/index.js";
import { runBlkRewardCycle } from "../modules/mining/index.js";

const log = logger.child("BlkRewardCron");

const DEFAULT_INTERVAL_MS = 60 * 1000;

export function startBlkRewardCron(): { stop: () => void } {
  const intervalMs = Number(process.env.BLK_REWARD_CRON_MS || DEFAULT_INTERVAL_MS);
  const run = () => {
    runBlkRewardCycle().catch((err: unknown) => {
      log.error("runBlkRewardCycle failed", { error: err instanceof Error ? err.message : String(err) });
    });
  };
  run();
  const handle = setInterval(run, intervalMs);
  handle.unref?.();
  log.info("BLK reward cron started", { intervalMs });
  return { stop: () => clearInterval(handle) };
}
