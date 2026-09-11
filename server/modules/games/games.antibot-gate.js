import { bandForScore, computeWindowedScore } from "../antibot/antibot.repository.js";
import { ALERT_RISK_THRESHOLD, MAX_SCORE } from "../antibot/antibot.weights.js";
/** Alias kept for games tests / callers — same bands as antibot.repository. */
export function bandForGameScore(score) {
    return bandForScore(score);
}
function envFlag(name, fallback = "true") {
    return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? fallback).trim());
}
function envPositiveInt(name, fallback) {
    const raw = Number(process.env[name]);
    if (!Number.isFinite(raw) || raw <= 0)
        return fallback;
    return Math.floor(raw);
}
/** Master switch — default on. */
export function gameAntibotGateEnabled() {
    return envFlag("GAME_ANTIBOT_GATE_ENABLED", "true");
}
/**
 * Deny reward when riskScore >= this. Default = antibot alert threshold (61 → high band).
 * Set lower (e.g. 41) to also deny "suspicious".
 */
export function gameAntibotDenyMinScore() {
    return envPositiveInt("GAME_ANTIBOT_DENY_MIN_SCORE", ALERT_RISK_THRESHOLD);
}
/**
 * When true, also deny the "suspicious" band (41–60).
 * Default **false** — high/critical (+ DENY_MIN_SCORE) only; suspicious is noisy for legit players.
 */
export function gameAntibotDenySuspicious() {
    return envFlag("GAME_ANTIBOT_DENY_SUSPICIOUS", "false");
}
export function gameAntibotBlockCooldownSec() {
    return envPositiveInt("GAME_ANTIBOT_BLOCK_COOLDOWN_SEC", 60);
}
export function gameAntibotAutomationCooldownSec() {
    return envPositiveInt("GAME_ANTIBOT_AUTOMATION_COOLDOWN_SEC", 120);
}
function bandDenied(band, score) {
    if (band === "high" || band === "critical")
        return true;
    if (gameAntibotDenySuspicious() && band === "suspicious")
        return true;
    return score >= gameAntibotDenyMinScore();
}
/** Pure — unit-testable. Trusted profiles always pass. */
export function evaluateGameRewardGate(input) {
    if (!gameAntibotGateEnabled()) {
        return { allowed: true, reason: null, messageCode: null, cooldownSeconds: 0, band: null, riskScore: 0 };
    }
    if (input.automationDetected) {
        return {
            allowed: false,
            reason: "automation_detected",
            messageCode: "antibot_automation",
            cooldownSeconds: gameAntibotAutomationCooldownSec(),
            band: null,
            riskScore: Number(input.riskScore) || 0,
        };
    }
    if (input.trusted) {
        return {
            allowed: true,
            reason: null,
            messageCode: null,
            cooldownSeconds: 0,
            band: "trusted",
            riskScore: Number(input.riskScore) || 0,
        };
    }
    const score = Math.max(0, Math.min(100, Math.round(Number(input.riskScore) || 0)));
    const band = bandForGameScore(score);
    if (bandDenied(band, score)) {
        return {
            allowed: false,
            reason: `band:${band}`,
            messageCode: "antibot_blocked",
            cooldownSeconds: gameAntibotBlockCooldownSec(),
            band,
            riskScore: score,
        };
    }
    return { allowed: true, reason: null, messageCode: null, cooldownSeconds: 0, band, riskScore: score };
}
/** Load trusted flag + live windowed score, then evaluate. Never throws. */
export async function loadAndEvaluateGameRewardGate(prisma, userId, automationDetected = false) {
    if (!gameAntibotGateEnabled()) {
        return evaluateGameRewardGate({ riskScore: 0, trusted: false, automationDetected });
    }
    try {
        if (prisma?.antibotProfile?.findUnique == null) {
            return evaluateGameRewardGate({ riskScore: 0, trusted: false, automationDetected });
        }
        const profile = await prisma.antibotProfile.findUnique({
            where: { userId },
            select: { riskScore: true, trusted: true },
        });
        if (profile?.trusted) {
            return evaluateGameRewardGate({ riskScore: 0, trusted: true, automationDetected });
        }
        // Live window — stale profile.riskScore must not keep denying after evidence ages out.
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
        return evaluateGameRewardGate({
            riskScore: score,
            trusted: false,
            automationDetected,
        });
    }
    catch {
        // Honest degrade: gate failure must not crash reward path — deny only on known signals.
        return evaluateGameRewardGate({ riskScore: 0, trusted: false, automationDetected });
    }
}
