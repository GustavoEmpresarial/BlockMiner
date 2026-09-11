/**
 * Cloudflare Turnstile gate for feature entry points
 * (youtube / faucet / shortlink / automining).
 *
 * Page-entry captcha every visit (reload / re-open). No time-based TTL.
 * Solving grants a one-shot server pass consumed by the gated start/claim action.
 */
import {
  isTurnstileEnforced,
  resolveTurnstileSecret,
  verifyTurnstileToken,
} from "./turnstile.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("feature.turnstile");

export const FEATURE_TURNSTILE_PURPOSES = ["youtube", "faucet", "shortlink", "automining"] as const;
export type FeatureTurnstilePurpose = (typeof FEATURE_TURNSTILE_PURPOSES)[number];

function envFlag(name: string, fallbackTrue: boolean): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallbackTrue;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Master switch — default on whenever Turnstile secret exists. */
export function featureTurnstileEnabled(): boolean {
  if (!isTurnstileEnforced()) return false;
  return envFlag("FEATURE_TURNSTILE_ENABLED", true);
}

export function isFeatureTurnstilePurpose(raw: unknown): raw is FeatureTurnstilePurpose {
  return FEATURE_TURNSTILE_PURPOSES.includes(String(raw ?? "") as FeatureTurnstilePurpose);
}

type PassKey = `${FeatureTurnstilePurpose}:${number}`;
/** One-shot unlock after page-entry captcha — consumed on first gated action. */
const oneShotPasses = new Set<PassKey>();

function key(purpose: FeatureTurnstilePurpose, userId: number): PassKey {
  return `${purpose}:${userId}`;
}

export function hasFeatureTurnstilePass(
  purpose: FeatureTurnstilePurpose,
  userId: number,
): boolean {
  return oneShotPasses.has(key(purpose, userId));
}

export function grantFeatureTurnstilePass(
  purpose: FeatureTurnstilePurpose,
  userId: number,
): void {
  oneShotPasses.add(key(purpose, userId));
}

export function consumeFeatureTurnstilePass(
  purpose: FeatureTurnstilePurpose,
  userId: number,
): boolean {
  const k = key(purpose, userId);
  if (!oneShotPasses.has(k)) return false;
  oneShotPasses.delete(k);
  return true;
}

export function clearFeatureTurnstilePass(
  purpose: FeatureTurnstilePurpose,
  userId: number,
): void {
  oneShotPasses.delete(key(purpose, userId));
}

export type FeatureTurnstileStatus = {
  active: boolean;
  purpose: FeatureTurnstilePurpose;
  /** Always true while gate is on — UI must prompt every page visit. */
  required: boolean;
  hasPass: boolean;
};

export function getFeatureTurnstileStatus(
  purpose: FeatureTurnstilePurpose,
  userId: number,
  opts?: { invalidate?: boolean },
): FeatureTurnstileStatus {
  const active = featureTurnstileEnabled();
  if (opts?.invalidate) {
    clearFeatureTurnstilePass(purpose, userId);
  }
  return {
    active,
    purpose,
    required: active,
    hasPass: hasFeatureTurnstilePass(purpose, userId),
  };
}

export async function submitFeatureTurnstilePass(
  purpose: FeatureTurnstilePurpose,
  userId: number,
  cfTurnstileToken: unknown,
  remoteIp: string | undefined,
): Promise<{ ok: true } | { ok: false; code: "CAPTCHA_REQUIRED" | "CAPTCHA_FAILED" | "GATE_INACTIVE" }> {
  if (!featureTurnstileEnabled()) return { ok: false, code: "GATE_INACTIVE" };
  const secret = resolveTurnstileSecret();
  const result = await verifyTurnstileToken(cfTurnstileToken, remoteIp, { secret });
  if (!result.ok) return { ok: false, code: result.code };
  grantFeatureTurnstilePass(purpose, userId);
  log.info("feature_turnstile_pass_granted", { purpose, userId });
  return { ok: true };
}

export type FeatureTurnstileAssertResult =
  | { ok: true }
  | { ok: false; code: "CAPTCHA_REQUIRED" | "CAPTCHA_FAILED" };

/**
 * Require a verified Turnstile token or a page-entry one-shot pass.
 * Does not consume the pass (same visit can start/claim more than once).
 * Pass is cleared on the next page visit via status?invalidate=1.
 */
export async function assertFeatureTurnstile(
  purpose: FeatureTurnstilePurpose,
  userId: number,
  cfTurnstileToken: unknown,
  remoteIp: string | undefined,
): Promise<FeatureTurnstileAssertResult> {
  if (!featureTurnstileEnabled()) return { ok: true };

  if (hasFeatureTurnstilePass(purpose, userId)) return { ok: true };

  const token = typeof cfTurnstileToken === "string" ? cfTurnstileToken.trim() : "";
  if (token) {
    const secret = resolveTurnstileSecret();
    const result = await verifyTurnstileToken(token, remoteIp, { secret });
    if (result.ok) {
      grantFeatureTurnstilePass(purpose, userId);
      return { ok: true };
    }
    log.warn("feature_turnstile_blocked", { purpose, userId, code: result.code });
    return { ok: false, code: result.code };
  }

  log.warn("feature_turnstile_blocked", { purpose, userId, code: "CAPTCHA_REQUIRED" });
  return { ok: false, code: "CAPTCHA_REQUIRED" };
}

export function featureTurnstileDenyBody(code: "CAPTCHA_REQUIRED" | "CAPTCHA_FAILED") {
  return {
    ok: false as const,
    code,
    captchaRequired: true as const,
    message:
      code === "CAPTCHA_FAILED"
        ? "Human verification failed. Please try again."
        : "Human verification is required before continuing.",
  };
}
