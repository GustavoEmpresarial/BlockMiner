// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import * as repo from "./auto-mining.repository.js";
export async function createRewardHandler(req, res) {
    try {
        const { name, slug, gpu_hash_rate, image_url, description } = req.body;
        if (!name || !slug || gpu_hash_rate === undefined) {
            res.status(400).json({ ok: false, message: "Missing required fields" });
            return;
        }
        const reward = await repo.adminCreateReward({
            name: String(name),
            slug: String(slug),
            gpuHashRate: Number(gpu_hash_rate),
            imageUrl: image_url == null ? null : String(image_url),
            description: description == null ? undefined : String(description),
        });
        res.status(201).json({ ok: true, data: reward });
    }
    catch (err) {
        res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
}
export async function getAllRewardsHandler(_req, res) {
    try {
        const rewards = await repo.adminFindAllRewards();
        res.json({ ok: true, data: rewards, count: rewards.length });
    }
    catch {
        res.status(500).json({ ok: false, message: "Error fetching rewards" });
    }
}
export async function getActiveRewardsHandler(_req, res) {
    try {
        const rewards = await repo.adminFindActiveRewards();
        res.json({ ok: true, data: rewards, count: rewards.length });
    }
    catch {
        res.status(500).json({ ok: false, message: "Error fetching rewards" });
    }
}
export async function getRewardHandler(req, res) {
    try {
        const reward = await repo.adminFindRewardById(Number(req.params.reward_id));
        if (!reward) {
            res.status(404).json({ ok: false, message: "Reward not found" });
            return;
        }
        res.json({ ok: true, data: reward });
    }
    catch {
        res.status(500).json({ ok: false, message: "Error fetching reward" });
    }
}
export async function updateRewardHandler(req, res) {
    try {
        const reward = await repo.adminUpdateReward(Number(req.params.reward_id), req.body);
        res.json({ ok: true, data: reward });
    }
    catch (err) {
        res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
}
export async function activateRewardHandler(req, res) {
    try {
        const reward = await repo.adminUpdateReward(Number(req.params.reward_id), { isActive: true });
        res.json({ ok: true, data: reward });
    }
    catch (err) {
        res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
}
export async function deactivateRewardHandler(req, res) {
    try {
        const reward = await repo.adminUpdateReward(Number(req.params.reward_id), { isActive: false });
        res.json({ ok: true, data: reward });
    }
    catch (err) {
        res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
}
export async function deleteRewardHandler(req, res) {
    try {
        await repo.adminDeleteReward(Number(req.params.reward_id));
        res.json({ ok: true, message: "Reward deleted" });
    }
    catch (err) {
        res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
    }
}
export async function getRewardsStatsHandler(_req, res) {
    try {
        const data = await repo.adminCountRewards();
        res.json({ ok: true, data });
    }
    catch {
        res.status(500).json({ ok: false, message: "Error fetching stats" });
    }
}
/** repo.adminGetReleasedGPUs / repo.adminGetGPUReport exist (ported for parity, e.g. future
 *  admin dashboards) but legacy never wired them to a route either — no admin.controller
 *  handler or admin.routes entry consumes them there. Not exposing new endpoints for them
 *  here keeps admin scope exactly what legacy exposed (task instruction: "don't invent"). */
