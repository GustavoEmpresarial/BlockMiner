import * as miningService from "./mining.service.js";
import { runBlkRewardCycle } from "./mining.blk-cycle.js";
/** Admin manual trigger: force-settle the current block right now. */
export async function adminTriggerBlockCycle(_req, res) {
    try {
        const result = await miningService.adminRunBlockCycle();
        res.json({ ok: true, result });
    }
    catch (e) {
        res.status(500).json({ ok: false, message: e instanceof Error ? e.message : String(e) || "Failed" });
    }
}
/**
 * Admin manual trigger: run one BLK reward-distribution cycle now. Ported from legacy
 * mining.admin.controller.ts:adminTriggerBlkCycle. There is no cron for this — legacy only ever
 * fired it from this endpoint, and current/ preserves that (manual-only, idempotent per window).
 */
export async function adminTriggerBlkCycle(_req, res) {
    try {
        const result = await runBlkRewardCycle();
        res.json({ ok: true, result });
    }
    catch (e) {
        res.status(500).json({ ok: false, message: e instanceof Error ? e.message : String(e) || "Failed" });
    }
}
