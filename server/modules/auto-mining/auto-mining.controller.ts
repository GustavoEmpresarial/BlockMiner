// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import * as service from "./auto-mining.service.js";
const log = logger.child("AutoMiningController");
/** GET /available */
export async function getAvailableGPUsHandler(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const gpus = await service.getAvailableGPUs(user.id);
        res.json({ ok: true, data: gpus, count: gpus.length });
    }
    catch (err) {
        log.error("getAvailableGPUs failed", { error: err instanceof Error ? err.message : String(err) });
        res.status(500).json({ ok: false, message: "Server error" });
    }
}
/** POST /claim */
export async function claimGPUHandler(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const { gpu_id } = req.body;
        if (!gpu_id) {
            res.status(400).json({ ok: false, message: "GPU ID is required" });
            return;
        }
        const { gpu } = await service.claimGPU(user.id, Number(gpu_id));
        res.json({ ok: true, message: "GPU claimed successfully", data: gpu });
    }
    catch (err) {
        const e = err;
        if (e.code === "GPU_NOT_FOUND") {
            res.status(404).json({ ok: false, message: e.message, code: e.code });
            return;
        }
        if (e.code === "DAILY_LIMIT_REACHED") {
            res.status(400).json({ ok: false, message: e.message, code: e.code });
            return;
        }
        if (e.code === "INSUFFICIENT_SECONDS") {
            res.status(400).json({ ok: false, message: e.message, code: e.code });
            return;
        }
        log.error("claimGPU failed", { error: e.message });
        res.status(400).json({ ok: false, message: "Unable to claim GPU" });
    }
}
/** GET /history */
export async function getGPUHistoryHandler(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const history = await service.getGPUHistory(user.id);
        res.json({ ok: true, data: history });
    }
    catch {
        res.status(500).json({ ok: false, message: "Server error" });
    }
}
/** GET /active-reward */
export async function getActiveRewardHandler(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const { reward, stats } = await service.getActiveRewardWithStats(user.id);
        res.json({ ok: true, data: reward, stats });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("getActiveReward failed", { error: msg, stack: err instanceof Error ? err.stack : undefined });
        res.status(500).json({ ok: false, message: "Internal server error" });
    }
}
