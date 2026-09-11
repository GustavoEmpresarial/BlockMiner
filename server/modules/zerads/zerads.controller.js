import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { consumeOfferwallPass, extractPassToken } from "../bm-captcha/index.js";
import * as zeradsService from "./zerads.service.js";
const log = logger.child("zerads.controller");
// Suporta ZERADS_ALLOWED_IPS (legado) ou ZERADS_SERVER_IP.
function getClientIp(req) {
    // Site sits behind Cloudflare; real origin IP is in CF-Connecting-IP.
    const cfIp = req.headers["cf-connecting-ip"];
    if (cfIp && typeof cfIp === "string")
        return cfIp.trim();
    return String(req.ip ?? "").replace("::ffff:", "");
}
/**
 * GET /zeradsptc.php
 * Zerads server callback — every ~5 minutes per user. Public S2S route, NOT under /api and
 * NOT behind requireAuth: security is IP allowlist + timing-safe password comparison instead
 * (see zerads.service.ts). Returns "1" on success, "0" on any failure (matches their PHP pattern).
 */
export async function zeradsCallbackHandler(req, res) {
    const clientIp = getClientIp(req);
    if (!zeradsService.isIpAllowed(clientIp)) {
        log.warn("zerads.callback.ip_rejected", { ip: clientIp, allowed: [...zeradsService.ZERADS_ALLOWED_IPS] });
        res.status(403).send("0");
        return;
    }
    const { pwd, user: username, amount: rawAmount, clicks: rawClicks } = req.query;
    const result = await zeradsService.processZeradsCallback({ clientIp, pwd, username, rawAmount, rawClicks });
    if (!result.ok) {
        res.status(result.status).send("0");
        return;
    }
    res.send("1");
}
/** GET /api/zerads/link — returns the PTC URL for the authenticated user (captcha pass required). */
export async function getUserZeradsLink(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const pass = await consumeOfferwallPass({
            userId: user.id,
            provider: "zerads",
            passToken: extractPassToken(req),
        });
        if (!pass.ok) {
            res.status(pass.status).json({ ok: false, code: pass.code, reason: pass.code });
            return;
        }
        const payload = await zeradsService.getUserZeradsLink(user.id);
        res.json(payload);
    }
    catch (error) {
        log.error("getUserZeradsLink failed", { error: String(error) });
        res.status(500).json({ ok: false, message: "Error loading link." });
    }
}
/** GET /api/zerads/history?page=1 — paginated PTC callback history for the authenticated user. */
export async function getZeradsHistory(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
        const payload = await zeradsService.getZeradsHistoryForUser(user.id, page);
        res.json({ ok: true, ...payload });
    }
    catch (error) {
        log.error("getZeradsHistory failed", { error: String(error) });
        res.status(500).json({ ok: false });
    }
}
/** GET /api/zerads/stats — total ZER earned and POL credited for the authenticated user. */
export async function getZeradsStats(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const payload = await zeradsService.getZeradsStatsForUser(user.id);
        res.json({ ok: true, ...payload });
    }
    catch (error) {
        log.error("getZeradsStats failed", { error: String(error) });
        res.status(500).json({ ok: false });
    }
}
