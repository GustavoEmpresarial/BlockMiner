// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logger } from "../../core/logger/index.js";
import { authDebug } from "../../shared/security/authDebug.js";
import { signAccessToken } from "../../shared/security/authTokens.js";
import { appendSetCookie, buildAccessCookie } from "../../shared/security/cookies.js";
import { decodeFingerprint, fingerprintTimestampValid, processHeartbeatForUser } from "./session.heartbeat.service.js";
import { maybeRenewAccessCookie } from "./session.refresh.controller.js";
const log = logger.child("SessionController");
export async function processHeartbeat(req, res) {
    try {
        if (req.user == null) {
            res.status(401).json({ ok: false, code: "UNAUTHENTICATED", message: "Unauthorized" });
            return;
        }
        const userId = req.user.id;
        const { type, security } = req.body;
        if (!type || !["youtube", "auto-mining"].includes(type)) {
            res.status(400).json({ ok: false, code: "INVALID_TYPE", message: "Invalid type" });
            return;
        }
        const botFlag = security?.isBot === true;
        const decoded = decodeFingerprint(security?.fingerprint);
        if (!decoded.ok) {
            res.status(400).json({ ok: false, code: decoded.code, message: "Security check failed" });
            return;
        }
        if (botFlag || decoded.data.b === true) {
            log.warn(`Bot signature detected for user ${userId} on ${type}`);
            res.status(403).json({ ok: false, code: "BOT_DETECTED", message: "Automation detected. Access denied." });
            return;
        }
        if (!fingerprintTimestampValid(decoded.data.ts)) {
            res.status(400).json({ ok: false, code: "FINGERPRINT_STALE", message: "Invalid session token" });
            return;
        }
        const result = await processHeartbeatForUser(userId, type);
        if (result.throttled) {
            maybeRenewAccessCookie(req, res);
            res.json({ ok: true, throttled: true });
            return;
        }
        maybeRenewAccessCookie(req, res);
        authDebug("HEARTBEAT_OK", req, { userId, type, credit: result.credited });
        res.json({ ok: true, credited: result.credited });
    }
    catch (e) {
        log.error("Heartbeat error", { message: e instanceof Error ? e.message : String(e) });
        res.status(500).json({ ok: false, code: "INTERNAL_ERROR" });
    }
}
/** Explicit sliding renewal for earn pages after successful mutations (claim, etc.). */
export function attachSlidingAccessCookie(req, res) {
    if (!req.user)
        return;
    const renewed = signAccessToken(req.user);
    appendSetCookie(res, buildAccessCookie(renewed));
}
