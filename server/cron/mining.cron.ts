// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Mining cron — the heartbeat of the mining engine. Ported behavior from
 * legacy/server/cron/miningCron.ts, simplified to `setInterval` per doctrine (no BullMQ/Redis
 * here; mining doesn't need a queue, just a periodic in-process tick).
 *
 * Thin orchestration only: every real decision (tick accumulation, block settlement, DB
 * persistence) lives in mining/mining.engine.ts + mining/mining.service.ts. This file just calls
 * `runEngineTick()` on an interval — same shape as the legacy tick loop's `DEFAULT_TICK_MS`.
 *
 * Deviation: legacy also does periodic hashrate resync from miner profiles and drives Socket.IO
 * broadcasts (`buildPublicState`/`io.emit`) inside the loop. Sockets are out of scope for this
 * phase (core/socket/ doesn't exist yet — state is poll-only via GET /api/mining/cycle), so this
 * cron is intentionally just the tick call.
 */
import { logger } from "../core/logger/index.js";
import { runEngineTick } from "../modules/mining/index.js";
const log = logger.child("MiningCron");
const DEFAULT_TICK_MS = 1000;
export function startMiningCron() {
    const tickMs = Number(process.env.MINING_TICK_MS || DEFAULT_TICK_MS);
    const handle = setInterval(() => {
        runEngineTick().catch((err) => {
            log.error("Mining tick failed", { error: err instanceof Error ? err.message : String(err) });
        });
    }, tickMs);
    handle.unref?.();
    log.info("Mining cron started", { tickMs });
    return { stop: () => clearInterval(handle) };
}
