// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { parseClientErrorBody, parseHitBody, sanitizeString } from "./traffic.schemas.js";
import { recordHit, reportClientError } from "./traffic.service.js";
export async function postHit(req, res) {
    await recordHit(parseHitBody(req.body));
    res.json({ ok: true });
}
export async function postClientError(req, res) {
    const body = parseClientErrorBody(req.body);
    const userAgent = sanitizeString(req.headers["user-agent"], 400);
    const ip = String(req.ip ?? req.headers["x-forwarded-for"] ?? "").slice(0, 64);
    // `requireAuth` is intentionally not used on this route (see traffic.routes.ts,
    // which applies `authenticateTokenOptional` instead): anonymous /register and
    // /auth/session failures must still be reportable, so a best-effort userId
    // (present only when a valid session cookie happens to exist) is read here
    // instead of gating the whole endpoint behind auth.
    const userId = req.user?.id ?? null;
    const result = await reportClientError({ body, userAgent, ip, userId });
    res.json({ ok: true, dropped: result.dropped });
}
