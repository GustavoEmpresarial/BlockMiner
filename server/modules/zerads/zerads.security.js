import { bandForScore, computeWindowedScore } from "../antibot/antibot.repository.js";
import { ALERT_RISK_THRESHOLD, MAX_SCORE } from "../antibot/antibot.weights.js";
function envFlag(name, fallback = "true") {
    return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? fallback).trim());
}
function envPositiveInt(name, fallback) {
    const raw = Number(process.env[name]);
    if (!Number.isFinite(raw) || raw <= 0)
        return fallback;
    return Math.floor(raw);
}
/** Master switch for antibot score gate on Zerads credit. Default on. */
export function zeradsAntibotGateEnabled() {
    return envFlag("ZERADS_ANTIBOT_GATE_ENABLED", "true");
}
/** Deny credit when windowed riskScore >= this. Default = antibot alert threshold (61). */
export function zeradsAntibotDenyMinScore() {
    return envPositiveInt("ZERADS_ANTIBOT_DENY_MIN_SCORE", ALERT_RISK_THRESHOLD);
}
/** Also deny "suspicious" band (41–60). Default off — noisy for legit PTC. */
export function zeradsAntibotDenySuspicious() {
    return envFlag("ZERADS_ANTIBOT_DENY_SUSPICIOUS", "false");
}
/**
 * Cap clicks accepted from a single S2S hit.
 * Provider batches periodically; unbounded clicks in one callback is farming-shaped.
 */
export function zeradsMaxClicksPerCallback() {
    return envPositiveInt("ZERADS_MAX_CLICKS_PER_CALLBACK", 10);
}
/** Rolling window length for velocity cap (ms). Default 1 hour. */
export function zeradsVelocityWindowMs() {
    return envPositiveInt("ZERADS_VELOCITY_WINDOW_MS", 3_600_000);
}
/** Max credited clicks inside the rolling velocity window. Default 30. */
export function zeradsMaxClicksPerVelocityWindow() {
    return envPositiveInt("ZERADS_MAX_CLICKS_PER_VELOCITY_WINDOW", 30);
}
function bandDenied(band, score) {
    if (band === "high" || band === "critical")
        return true;
    if (zeradsAntibotDenySuspicious() && band === "suspicious")
        return true;
    return score >= zeradsAntibotDenyMinScore();
}
/** Pure — unit-testable. Trusted profiles always pass. */
export function evaluateZeradsAntibotGate(input) {
    if (!zeradsAntibotGateEnabled()) {
        return { allowed: true, reason: null, band: null, riskScore: 0 };
    }
    if (input.trusted) {
        return { allowed: true, reason: null, band: "trusted", riskScore: Number(input.riskScore) || 0 };
    }
    const score = Math.max(0, Math.min(100, Math.round(Number(input.riskScore) || 0)));
    const band = bandForScore(score);
    if (bandDenied(band, score)) {
        return { allowed: false, reason: `band:${band}`, band, riskScore: score };
    }
    return { allowed: true, reason: null, band, riskScore: score };
}
/** Load windowed antibot score and evaluate. Never throws — fail-open on infra errors. */
export async function loadAndEvaluateZeradsAntibotGate(prisma, userId) {
    if (!zeradsAntibotGateEnabled()) {
        return evaluateZeradsAntibotGate({ riskScore: 0, trusted: false });
    }
    try {
        if (prisma?.antibotProfile?.findUnique == null) {
            return evaluateZeradsAntibotGate({ riskScore: 0, trusted: false });
        }
        const profile = await prisma.antibotProfile.findUnique({
            where: { userId },
            select: { riskScore: true, trusted: true },
        });
        if (profile?.trusted) {
            return evaluateZeradsAntibotGate({ riskScore: 0, trusted: true });
        }
        const { score } = await computeWindowedScore(prisma, userId);
        if (profile && profile.riskScore !== score) {
            void prisma.antibotProfile
                .update({
                where: { userId },
                data: {
                    riskScore: score,
                    trustScore: MAX_SCORE - score,
                    lastComputedAt: new Date(),
                },
            })
                .catch(() => undefined);
        }
        return evaluateZeradsAntibotGate({ riskScore: score, trusted: false });
    }
    catch {
        return evaluateZeradsAntibotGate({ riskScore: 0, trusted: false });
    }
}
/**
 * Apply callback / day / velocity caps in that order.
 * Pure — no I/O.
 */
export function trimZeradsClicksForSecurity(input) {
    const maxCb = input.maxPerCallback ?? zeradsMaxClicksPerCallback();
    const maxVel = input.maxPerVelocityWindow ?? zeradsMaxClicksPerVelocityWindow();
    const requested = Math.max(0, Math.trunc(input.requestedClicks));
    if (requested <= 0) {
        return { creditedClicks: 0, trimReason: "none" };
    }
    let clicks = requested;
    let trimReason = "ok";
    if (clicks > maxCb) {
        clicks = maxCb;
        trimReason = "callback_cap";
    }
    const dayRem = Math.max(0, Math.trunc(input.dayRemaining));
    if (clicks > dayRem) {
        clicks = dayRem;
        trimReason = "day_cap";
    }
    const velUsed = Math.max(0, Math.trunc(input.clicksInVelocityWindow));
    const velRem = Math.max(0, maxVel - velUsed);
    if (clicks > velRem) {
        clicks = velRem;
        trimReason = "velocity_cap";
    }
    if (clicks <= 0) {
        return { creditedClicks: 0, trimReason };
    }
    return { creditedClicks: clicks, trimReason };
}
export function zeradsVelocityWindowBounds(now = new Date()) {
    const end = now;
    const start = new Date(now.getTime() - zeradsVelocityWindowMs());
    return { start, end };
}
