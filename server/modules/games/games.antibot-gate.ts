/**
 * Mini-game reward gate — antibot profile + automation signals.
 * Pure policy (evaluateGameRewardGate) + thin DB loader.
 * Band cutoffs match antibot.repository bandForScore (trusted≤20 … critical>80).
 *
 * Score source is the **windowed** evidence set (SCORE_WINDOW_DAYS), not the possibly
 * stale antibot_profiles.risk_score left behind when telemetry went quiet.
 */
import type { AppPrisma } from "../../core/database/prisma.js";
import { bandForScore, computeWindowedScore } from "../antibot/antibot.repository.js";
import { ALERT_RISK_THRESHOLD, MAX_SCORE } from "../antibot/antibot.weights.js";
import type { RiskBand } from "../antibot/antibot.types.js";

/** Alias kept for games tests / callers — same bands as antibot.repository. */
export function bandForGameScore(score: number): RiskBand {
  return bandForScore(score);
}

function envFlag(name: string, fallback = "true"): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? fallback).trim());
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

/** Master switch — default on. */
export function gameAntibotGateEnabled(): boolean {
  return envFlag("GAME_ANTIBOT_GATE_ENABLED", "true");
}

/**
 * Deny reward when riskScore >= this. Default = antibot alert threshold (61 → high band).
 * Set lower (e.g. 41) to also deny "suspicious".
 */
export function gameAntibotDenyMinScore(): number {
  return envPositiveInt("GAME_ANTIBOT_DENY_MIN_SCORE", ALERT_RISK_THRESHOLD);
}

/**
 * When true, also deny the "suspicious" band (41–60).
 * Default **false** — high/critical (+ DENY_MIN_SCORE) only; suspicious is noisy for legit players.
 */
export function gameAntibotDenySuspicious(): boolean {
  return envFlag("GAME_ANTIBOT_DENY_SUSPICIOUS", "false");
}

export function gameAntibotBlockCooldownSec(): number {
  return envPositiveInt("GAME_ANTIBOT_BLOCK_COOLDOWN_SEC", 60);
}

export function gameAntibotAutomationCooldownSec(): number {
  return envPositiveInt("GAME_ANTIBOT_AUTOMATION_COOLDOWN_SEC", 120);
}

export type GameRewardGateInput = {
  riskScore: number | null | undefined;
  trusted?: boolean | null;
  automationDetected?: boolean;
};

export type GameRewardGateVerdict = {
  allowed: boolean;
  reason: string | null;
  messageCode: "antibot_blocked" | "antibot_automation" | null;
  cooldownSeconds: number;
  band: RiskBand | null;
  riskScore: number;
};

function bandDenied(band: RiskBand, score: number): boolean {
  if (band === "high" || band === "critical") return true;
  if (gameAntibotDenySuspicious() && band === "suspicious") return true;
  return score >= gameAntibotDenyMinScore();
}

/** Pure — unit-testable. Trusted profiles always pass. */
export function evaluateGameRewardGate(input: GameRewardGateInput): GameRewardGateVerdict {
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
export async function loadAndEvaluateGameRewardGate(
  prisma: AppPrisma | null | undefined,
  userId: number,
  automationDetected = false,
): Promise<GameRewardGateVerdict> {
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
  } catch {
    // Honest degrade: gate failure must not crash reward path — deny only on known signals.
    return evaluateGameRewardGate({ riskScore: 0, trusted: false, automationDetected });
  }
}
