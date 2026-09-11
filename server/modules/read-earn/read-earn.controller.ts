// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { ZodError } from "zod";
import { logger } from "../../core/logger/index.js";
import { REDEEM_ALREADY, REDEEM_GENERIC } from "./read-earn.errors.js";
import { parseReadEarnRedeem } from "./read-earn.schemas.js";
import { listPublicReadEarnCampaigns, redeemReadEarnCampaign } from "./read-earn.service.js";
const log = logger.child("read-earn.controller");
export async function getPublicReadEarnCampaigns(_req, res) {
    try {
        const campaigns = await listPublicReadEarnCampaigns();
        res.json({ ok: true, campaigns });
    }
    catch (e) {
        log.error("getPublicReadEarnCampaigns failed", { error: String(e) });
        res.status(500).json({ ok: false, message: "Failed to load campaigns." });
    }
}
export async function postReadEarnRedeem(req, res) {
    try {
        const body = parseReadEarnRedeem(req.body || {});
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ ok: false, code: REDEEM_GENERIC, message: "Session invalid." });
            return;
        }
        const ip = req.ip || null;
        const userAgent = req.headers["user-agent"] || null;
        const result = await redeemReadEarnCampaign({
            userId,
            campaignId: body.campaignId,
            rawCode: body.code,
            ip,
            userAgent,
            logger: { error: (msg, meta) => log.error(msg, { error: String(meta) }) },
        });
        if (!result.ok) {
            const status = result.code === REDEEM_ALREADY ? 409 : 400;
            res.status(status).json({ ok: false, code: result.code, message: result.code });
            return;
        }
        res.json({ ok: true, code: "OK", reward: result.reward });
    }
    catch (e) {
        if (e instanceof ZodError) {
            res.status(400).json({ ok: false, code: REDEEM_GENERIC, message: "Invalid request." });
            return;
        }
        log.error("postReadEarnRedeem failed", { error: String(e) });
        res.status(500).json({ ok: false, code: REDEEM_GENERIC, message: "Redeem failed." });
    }
}
