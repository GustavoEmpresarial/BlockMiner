/**
 * Zerads S2S credit security — velocity + antibot gate.
 *
 * Client cannot see captcha solvers inside the cross-origin Zerads iframe.
 * These checks run on the provider callback path before BLK is credited.
 *
 * Soft-deny (like the daily click cap): return creditedClicks=0 and still ack "1"
 * so Zerads does not retry-spam. Hard errors stay in processZeradsCallback.
 *
 * All thresholds are named env readers — no ad-hoc magic numbers in the hot path.
 */
import type { AppPrisma } from "../../core/database/prisma.js";
import { bandForScore, computeWindowedScore } from "../antibot/antibot.repository.js";
import { ALERT_RISK_THRESHOLD, MAX_SCORE } from "../antibot/antibot.weights.js";
import type { RiskBand } from "../antibot/antibot.types.js";

function envFlag(name: string, fallback = "true"): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env[name] ?? fallback).trim());
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

/** Master switch for antibot score gate on Zerads credit. Default on. */
export function zeradsAntibotGateEnabled(): boolean {
  return envFlag("ZERADS_ANTIBOT_GATE_ENABLED", "true");
}

/** Deny credit when windowed riskScore >= this. Default = antibot alert threshold (61). */
export function zeradsAntibotDenyMinScore(): number {
  return envPositiveInt("ZERADS_ANTIBOT_DENY_MIN_SCORE", ALERT_RISK_THRESHOLD);
}

/** Also deny "suspicious" band (41–60). Default off — noisy for legit PTC. */
export function zeradsAntibotDenySuspicious(): boolean {
  return envFlag("ZERADS_ANTIBOT_DENY_SUSPICIOUS", "false");
}

/**
 * Cap clicks accepted from a single S2S hit.
 * Provider batches periodically; unbounded clicks in one callback is farming-shaped.
 */
export function zeradsMaxClicksPerCallback(): number {
  return envPositiveInt("ZERADS_MAX_CLICKS_PER_CALLBACK", 10);
}

/** Rolling window length for velocity cap (ms). Default 1 hour. */
export function zeradsVelocityWindowMs(): number {
  return envPositiveInt("ZERADS_VELOCITY_WINDOW_MS", 3_600_000);
}

/** Max credited clicks inside the rolling velocity window. Default 30. */
export function zeradsMaxClicksPerVelocityWindow(): number {
  return envPositiveInt("ZERADS_MAX_CLICKS_PER_VELOCITY_WINDOW", 30);
}

export type ZeradsAntibotVerdict = {
  allowed: boolean;
  reason: string | null;
  band: RiskBand | null;
  riskScore: number;
};

function bandDenied(band: RiskBand, score: number): boolean {
  if (band === "high" || band === "critical") return true;
  if (zeradsAntibotDenySuspicious() && band === "suspicious") return true;
  return score >= zeradsAntibotDenyMinScore();
}

/** Pure — unit-testable. Trusted profiles always pass. */
export function evaluateZeradsAntibotGate(input: {
  riskScore: number | null | undefined;
  trusted?: boolean | null;
}): ZeradsAntibotVerdict {
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
export async function loadAndEvaluateZeradsAntibotGate(
  prisma: AppPrisma | null | undefined,
  userId: number,
): Promise<ZeradsAntibotVerdict> {
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
  } catch {
    return evaluateZeradsAntibotGate({ riskScore: 0, trusted: false });
  }
}

export type ZeradsClickTrimInput = {
  requestedClicks: number;
  /** Remaining under UTC-day cap (already computed by caller). */
  dayRemaining: number;
  /** Clicks already credited inside the rolling velocity window. */
  clicksInVelocityWindow: number;
  maxPerCallback?: number;
  maxPerVelocityWindow?: number;
};

export type ZeradsClickTrimResult = {
  creditedClicks: number;
  /** Why credited < requested (last applied trim wins for logging). */
  trimReason: "ok" | "callback_cap" | "day_cap" | "velocity_cap" | "none";
};

/**
 * Apply callback / day / velocity caps in that order.
 * Pure — no I/O.
 */
export function trimZeradsClicksForSecurity(input: ZeradsClickTrimInput): ZeradsClickTrimResult {
  const maxCb = input.maxPerCallback ?? zeradsMaxClicksPerCallback();
  const maxVel = input.maxPerVelocityWindow ?? zeradsMaxClicksPerVelocityWindow();
  const requested = Math.max(0, Math.trunc(input.requestedClicks));
  if (requested <= 0) {
    return { creditedClicks: 0, trimReason: "none" };
  }

  let clicks = requested;
  let trimReason: ZeradsClickTrimResult["trimReason"] = "ok";

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

export function zeradsVelocityWindowBounds(now: Date = new Date()): { start: Date; end: Date } {
  const end = now;
  const start = new Date(now.getTime() - zeradsVelocityWindowMs());
  return { start, end };
}
