// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logger } from "../../core/logger/index.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { claimMiniPassLevelReward } from "./mini-pass.claim.service.js";
import { getMiniPassSeasonDashboard, listLiveMiniPassSeasons } from "./mini-pass.dashboard.service.js";
import { purchaseMiniPassComplete, purchaseMiniPassLevels } from "./mini-pass.purchase.service.js";
const log = logger.child("mini-pass.controller");
function langFromReq(req) {
    const raw = req.headers["accept-language"];
    if (Array.isArray(raw))
        return raw[0] ?? "en";
    return typeof raw === "string" ? raw : "en";
}
export async function listMiniPassSeasons(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const rows = await listLiveMiniPassSeasons(langFromReq(req));
        res.json({ ok: true, seasons: rows });
    }
    catch (e) {
        log.error("listMiniPassSeasons", { error: String(e) });
        res.status(500).json({ ok: false, code: "error", message: "Failed to list seasons." });
    }
}
export async function getMiniPassSeason(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const seasonId = parseInt(String(req.params.seasonId), 10);
        if (!seasonId) {
            res.status(400).json({ ok: false, code: "invalid_season", message: "Invalid season." });
            return;
        }
        const data = await getMiniPassSeasonDashboard(user.id, seasonId, langFromReq(req));
        if (!data.ok) {
            res.status(data.status ?? 500).json({ ok: false, code: data.code, message: data.code });
            return;
        }
        const { ok: _ok, ...rest } = data;
        res.json({ ok: true, ...rest });
    }
    catch (e) {
        log.error("getMiniPassSeason", { error: String(e) });
        res.status(500).json({ ok: false, code: "error", message: "Failed to load season." });
    }
}
export async function postClaimMiniPassReward(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const seasonId = parseInt(String(req.params.seasonId), 10);
        const levelRewardId = parseInt(String(req.params.levelRewardId), 10);
        if (!seasonId || !levelRewardId) {
            res.status(400).json({ ok: false, code: "invalid_params", message: "Invalid params." });
            return;
        }
        const r = await claimMiniPassLevelReward(user.id, seasonId, levelRewardId);
        if (!r.ok) {
            res.status(r.status ?? 500).json({ ok: false, code: r.code, message: r.code });
            return;
        }
        res.json({
            ok: true,
            duplicate: r.duplicate,
            summary: r.summary,
        });
    }
    catch (e) {
        log.error("postClaimMiniPassReward", { error: String(e) });
        res.status(500).json({ ok: false, code: "error", message: "Claim failed." });
    }
}
export async function postBuyMiniPassLevels(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const seasonId = parseInt(String(req.params.seasonId), 10);
        const quantity = Math.floor(Number(req.body?.quantity ?? 1));
        if (!seasonId) {
            res.status(400).json({ ok: false, code: "invalid_season", message: "Invalid season." });
            return;
        }
        const r = await purchaseMiniPassLevels(user.id, seasonId, quantity);
        if (!r.ok) {
            res.status(r.status ?? 500).json({ ok: false, code: r.code, message: r.code });
            return;
        }
        res.json({ ok: true, purchaseId: r.purchaseId, polBalance: r.polBalance });
    }
    catch (e) {
        log.error("postBuyMiniPassLevels", { error: String(e) });
        res.status(500).json({ ok: false, code: "error", message: "Purchase failed." });
    }
}
export async function postCompleteMiniPass(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const seasonId = parseInt(String(req.params.seasonId), 10);
        if (!seasonId) {
            res.status(400).json({ ok: false, code: "invalid_season", message: "Invalid season." });
            return;
        }
        const r = await purchaseMiniPassComplete(user.id, seasonId);
        if (!r.ok) {
            res.status(r.status ?? 500).json({ ok: false, code: r.code, message: r.code });
            return;
        }
        res.json({ ok: true, purchaseId: r.purchaseId, polBalance: r.polBalance });
    }
    catch (e) {
        log.error("postCompleteMiniPass", { error: String(e) });
        res.status(500).json({ ok: false, code: "error", message: "Purchase failed." });
    }
}
