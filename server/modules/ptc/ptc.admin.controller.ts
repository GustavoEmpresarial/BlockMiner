// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logger } from "../../core/logger/index.js";
import * as svc from "./ptc.service.js";
import * as repo from "./ptc.repository.js";
import { adminUpdateSettingsSchema, adminCreateTierSchema, adminUpdateTierSchema, adminRejectCampaignSchema, } from "./ptc.schemas.js";
const log = logger.child("ptc.admin.controller");
function err(res, status, msg) {
    res.status(status).json({ ok: false, message: msg });
}
function errorMessage(e) {
    return e instanceof Error ? e.message : "Server error";
}
export async function getSettings(_req, res) {
    try {
        const settings = await svc.getSettings();
        res.json({ ok: true, settings });
    }
    catch (e) {
        log.error("getSettings failed", { error: String(e) });
        err(res, 500, "Server error");
    }
}
export async function updateSettings(req, res) {
    try {
        const parsed = adminUpdateSettingsSchema.safeParse(req.body);
        if (!parsed.success) {
            err(res, 400, "Invalid settings payload.");
            return;
        }
        await svc.updateSettings(parsed.data);
        res.json({ ok: true });
    }
    catch (e) {
        err(res, 400, errorMessage(e));
    }
}
export async function listPending(_req, res) {
    try {
        const campaigns = await repo.getPendingCampaigns();
        res.json({ ok: true, campaigns });
    }
    catch (e) {
        log.error("listPending failed", { error: String(e) });
        err(res, 500, "Server error");
    }
}
export async function listAll(req, res) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        const result = await repo.getAllCampaignsAdmin(Number.isInteger(page) && page > 0 ? page : 1, Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 20);
        res.json({ ok: true, ...result });
    }
    catch (e) {
        log.error("listAll failed", { error: String(e) });
        err(res, 500, "Server error");
    }
}
export async function approve(req, res) {
    try {
        await svc.approveCampaign(Number(req.params.id));
        res.json({ ok: true });
    }
    catch (e) {
        err(res, 400, errorMessage(e));
    }
}
export async function reject(req, res) {
    try {
        const parsed = adminRejectCampaignSchema.safeParse(req.body ?? {});
        const reason = parsed.success ? parsed.data.reason : "Policy violation";
        await svc.rejectCampaign(Number(req.params.id), reason);
        res.json({ ok: true });
    }
    catch (e) {
        err(res, 400, errorMessage(e));
    }
}
export async function getTiers(_req, res) {
    try {
        const tiers = await svc.getTiers();
        res.json({ ok: true, tiers });
    }
    catch (e) {
        log.error("getTiers failed", { error: String(e) });
        err(res, 500, "Server error");
    }
}
export async function createTier(req, res) {
    try {
        const parsed = adminCreateTierSchema.safeParse(req.body);
        if (!parsed.success) {
            err(res, 400, "label, durationSeconds, pricePerViewShib and rewardPerViewShib are required");
            return;
        }
        const tier = await svc.createTier(parsed.data);
        res.json({ ok: true, tier });
    }
    catch (e) {
        err(res, 400, errorMessage(e));
    }
}
export async function updateTier(req, res) {
    try {
        const id = Number(req.params.id);
        const parsed = adminUpdateTierSchema.safeParse(req.body);
        if (!Number.isInteger(id) || id <= 0 || !parsed.success) {
            err(res, 400, "Invalid tier payload.");
            return;
        }
        const tier = await svc.updateTier(id, parsed.data);
        res.json({ ok: true, tier });
    }
    catch (e) {
        err(res, 400, errorMessage(e));
    }
}
export async function deleteTier(req, res) {
    try {
        await svc.deleteTier(Number(req.params.id));
        res.json({ ok: true });
    }
    catch (e) {
        err(res, 400, errorMessage(e));
    }
}
