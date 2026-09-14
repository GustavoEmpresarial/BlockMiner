import { logger } from "../../core/logger/index.js";
import { authLoginTrace } from "../security/authDebug.js";
const log = logger.child("Turnstile");
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Nunca deixar uma chamada externa segurar um login indefinidamente. */
const SITEVERIFY_TIMEOUT_MS = 10_000;
function envFlag(name) {
    const raw = String(process.env[name] ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
/** Secret específico do propósito, com fallback pro genérico (mesma precedência do legacy). */
export function resolveTurnstileSecret(purpose) {
    const fallback = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
    if (purpose === "login") {
        return String(process.env.TURNSTILE_SECRET_KEY_LOGIN || "").trim() || fallback;
    }
    if (purpose === "register") {
        return String(process.env.TURNSTILE_SECRET_KEY_REGISTER || "").trim() || fallback;
    }
    if (purpose === "forgot") {
        return String(process.env.TURNSTILE_SECRET_KEY_FORGOT || "").trim() || fallback;
    }
    return fallback;
}
/** True quando qualquer secret está configurado — o gate está ativo. */
export function isTurnstileEnforced() {
    return (resolveTurnstileSecret(undefined).length > 0 ||
        resolveTurnstileSecret("login").length > 0 ||
        resolveTurnstileSecret("register").length > 0 ||
        resolveTurnstileSecret("forgot").length > 0);
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
/**
 * Valida um token contra o siteverify da Cloudflare. Sem secret configurado devolve
 * `{ok:true}` (gate desligado) — o chamador decide se sequer chega aqui.
 */
export async function verifyTurnstileToken(token, remoteIp, options = {}) {
    const secret = String(options.secret ?? process.env.TURNSTILE_SECRET_KEY ?? "").trim();
    if (!secret)
        return { ok: true };
    const t = typeof token === "string" ? token.trim() : "";
    // Sem token não há o que verificar — corta antes de gastar uma chamada de rede.
    if (!t)
        return { ok: false, code: "CAPTCHA_REQUIRED" };
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", t);
    if (remoteIp)
        body.set("remoteip", remoteIp);
    const doFetch = options.fetchImpl ?? fetch;
    try {
        const res = await doFetch(SITEVERIFY_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
        });
        const parsed = await res.json().catch(() => ({}));
        const json = isRecord(parsed) ? parsed : {};
        if (json.success === true)
            return { ok: true };
        log.warn("turnstile.verification_failed", { errorCodes: json["error-codes"] });
        return { ok: false, code: "CAPTCHA_FAILED" };
    }
    catch (e) {
        // Rede/timeout/Cloudflare fora do ar — NÃO é o usuário falhando o captcha.
        const message = e instanceof Error ? e.message : String(e);
        log.error("turnstile.request_error", { message });
        if (envFlag("TURNSTILE_FAIL_OPEN"))
            return { ok: true };
        return { ok: false, code: "CAPTCHA_FAILED" };
    }
}
function normalizePurpose(arg) {
    if (arg === "login" || arg === "register" || arg === "forgot")
        return arg;
    if (arg && typeof arg === "object") {
        const p = arg.purpose;
        if (p === "login" || p === "register" || p === "forgot")
            return p;
    }
    return undefined;
}
/** Middleware: no-op sem secret; com secret, exige token válido de verdade. */
export function requireTurnstileWhenConfigured(arg) {
    const purpose = normalizePurpose(arg);
    const fetchImpl = arg && typeof arg === "object" ? arg.fetchImpl : undefined;
    return async (req, res, next) => {
        const secret = resolveTurnstileSecret(purpose);
        if (!secret) {
            next();
            return;
        }
        const bodyToken = req.body?.cfTurnstileToken;
        const token = bodyToken ?? req.headers["x-turnstile-token"];
        const ip = String(req.ip || req.socket?.remoteAddress || "");
        const result = await verifyTurnstileToken(token, ip, { secret, fetchImpl });
        if (!result.ok) {
            log.warn("turnstile.blocked", { path: req.path, code: result.code });
            authLoginTrace("AUTH_TURNSTILE_BLOCKED", req, {
                code: result.code,
                purpose: purpose ?? "generic",
                hasToken: Boolean(String(token ?? "").trim()),
                httpStatus: 400,
            });
            res.status(400).json({
                ok: false,
                code: result.code,
                message: result.code === "CAPTCHA_REQUIRED"
                    ? "Human verification is required."
                    : "Human verification failed. Please try again.",
            });
            return;
        }
        next();
    };
}
