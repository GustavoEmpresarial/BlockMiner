import { logger } from "../../core/logger/index.js";
import {
  BM_CAPTCHA_PURPOSE_OFFERWALL_EXTERNAL,
  bmCaptchaChallengeTtlMs,
  bmCaptchaEnabled,
  bmCaptchaHitRadiusPx,
  bmCaptchaHmacSecret,
  bmCaptchaMaxAttempts,
  bmCaptchaMinClickGapMs,
  bmCaptchaMinSolveMs,
  bmCaptchaMintMaxPerWindow,
  bmCaptchaMintWindowMs,
  bmCaptchaPassTtlMs,
  isBmCaptchaProvider,
  type BmCaptchaProvider,
} from "./bm-captcha.config.js";
import { mintChallengePair } from "./bm-captcha.challenge.js";
import { randomId, verifyPow } from "./bm-captcha.crypto.js";
import * as store from "./bm-captcha.store.js";
import type {
  BmCaptchaChallengePublic,
  BmCaptchaClick,
  BmCaptchaPurpose,
  BmCaptchaVerifyBody,
} from "./bm-captcha.types.js";

const log = logger.child("bm-captcha");

export type MintResult =
  | { ok: true; challenge: BmCaptchaChallengePublic }
  | { ok: false; code: string; status: number };

export type VerifyResult =
  | { ok: true; passToken: string; expiresAt: number }
  | { ok: false; code: string; status: number; attemptsLeft?: number };

export type ConsumePassResult =
  | { ok: true }
  | { ok: false; code: string; status: number };

type CaptchaReadyError = { ok: false; code: string; status: number };

function assertCaptchaReady(): CaptchaReadyError | null {
  if (!bmCaptchaEnabled()) {
    return { ok: false, code: "CAPTCHA_DISABLED", status: 503 };
  }
  if (!bmCaptchaHmacSecret()) {
    log.error("bm_captcha.no_secret");
    return { ok: false, code: "CAPTCHA_MISCONFIGURED", status: 503 };
  }
  return null;
}

function normalizeClicks(raw: unknown): BmCaptchaClick[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 16)
    .map((c) => {
      const o = c as Record<string, unknown>;
      return {
        id: Number.isFinite(Number(o.id)) ? Math.trunc(Number(o.id)) : undefined,
        x: Number(o.x),
        y: Number(o.y),
        t: Number(o.t),
      };
    })
    .filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.t));
}

/**
 * Resolve which target ids the click set covers.
 * Prefer sprite id when provided; else hit-test by radius against secret targets
 * using public positions reloaded from... we only have ids in secret.
 * Client must send sprite ids from hit-test (same canvas). Server checks id ∈ targetIds.
 */
function clicksMatchTargets(
  clicks: BmCaptchaClick[],
  targetIds: number[],
  minGapMs: number,
): { ok: boolean; reason?: string } {
  if (clicks.length !== targetIds.length) {
    return { ok: false, reason: "count" };
  }

  // Timing: reject robotic equal-gap spray / instant multi-click.
  const times = clicks.map((c) => c.t).sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++) {
    if (times[i]! - times[i - 1]! < minGapMs) {
      return { ok: false, reason: "gap" };
    }
  }

  const needed = new Set(targetIds);
  const got = new Set<number>();
  for (const c of clicks) {
    if (c.id == null || !Number.isFinite(c.id)) {
      return { ok: false, reason: "noid" };
    }
    if (!needed.has(c.id)) {
      return { ok: false, reason: "wrong" };
    }
    if (got.has(c.id)) {
      return { ok: false, reason: "dup" };
    }
    got.add(c.id);
  }
  if (got.size !== needed.size) {
    return { ok: false, reason: "incomplete" };
  }
  return { ok: true };
}

export async function mintChallenge(input: {
  userId: number;
  purpose: string;
  provider: string;
}): Promise<MintResult> {
  const blocked = assertCaptchaReady();
  if (blocked) return blocked;

  if (input.purpose !== BM_CAPTCHA_PURPOSE_OFFERWALL_EXTERNAL) {
    return { ok: false, code: "INVALID_PURPOSE", status: 400 };
  }
  if (!isBmCaptchaProvider(input.provider)) {
    return { ok: false, code: "INVALID_PROVIDER", status: 400 };
  }

  const quota = await store.tryConsumeMintQuota(
    input.userId,
    bmCaptchaMintMaxPerWindow(),
    bmCaptchaMintWindowMs(),
  );
  if (!quota) {
    log.warn("bm_captcha.mint_rate_limited", { userId: input.userId });
    return { ok: false, code: "RATE_LIMITED", status: 429 };
  }

  const { public: pub, secret } = mintChallengePair({
    userId: input.userId,
    purpose: input.purpose as BmCaptchaPurpose,
    provider: input.provider,
  });
  await store.saveChallenge(secret, bmCaptchaChallengeTtlMs());
  log.info("bm_captcha.minted", {
    userId: input.userId,
    provider: input.provider,
    challengeId: pub.challengeId,
    findCount: pub.findCount,
  });
  return { ok: true, challenge: pub };
}

export async function verifyChallenge(
  userId: number,
  body: BmCaptchaVerifyBody,
): Promise<VerifyResult> {
  const blocked = assertCaptchaReady();
  if (blocked) return blocked;

  const challengeId = String(body.challengeId || "").trim();
  if (!challengeId) return { ok: false, code: "MISSING_CHALLENGE", status: 400 };

  const rec = await store.loadChallenge(challengeId);
  if (!rec || rec.userId !== userId) {
    return { ok: false, code: "CHALLENGE_NOT_FOUND", status: 404 };
  }
  if (rec.solved) {
    return { ok: false, code: "ALREADY_SOLVED", status: 409 };
  }
  if (rec.expiresAt <= Date.now()) {
    await store.deleteChallenge(challengeId);
    return { ok: false, code: "CHALLENGE_EXPIRED", status: 410 };
  }

  rec.attempts += 1;
  if (rec.attempts > bmCaptchaMaxAttempts()) {
    await store.deleteChallenge(challengeId);
    log.warn("bm_captcha.too_many_attempts", { userId, challengeId });
    return { ok: false, code: "TOO_MANY_ATTEMPTS", status: 429, attemptsLeft: 0 };
  }

  const elapsed = Date.now() - rec.createdAt;
  if (elapsed < bmCaptchaMinSolveMs()) {
    await store.updateChallenge(rec);
    return {
      ok: false,
      code: "TOO_FAST",
      status: 400,
      attemptsLeft: bmCaptchaMaxAttempts() - rec.attempts,
    };
  }

  const clicks = normalizeClicks(body.clicks);
  const powCounter = Math.trunc(Number(body.powCounter));
  if (!Number.isFinite(powCounter)) {
    await store.updateChallenge(rec);
    return { ok: false, code: "INVALID_SOLUTION", status: 400 };
  }

  // Soft use of hit radius config for future coord fallback (id-based for now).
  void bmCaptchaHitRadiusPx;

  const match = clicksMatchTargets(clicks, rec.targetIds, bmCaptchaMinClickGapMs());
  const powOk = verifyPow(rec.powPrefix, powCounter, rec.powDifficulty);

  if (!match.ok || !powOk) {
    await store.updateChallenge(rec);
    log.warn("bm_captcha.verify_failed", {
      userId,
      challengeId,
      match: match.reason || "ok",
      powOk,
      attempts: rec.attempts,
    });
    return {
      ok: false,
      code: "SOLUTION_WRONG",
      status: 400,
      attemptsLeft: bmCaptchaMaxAttempts() - rec.attempts,
    };
  }

  rec.solved = true;
  await store.deleteChallenge(challengeId);

  const passId = randomId(24);
  const ts = Date.now();
  const expiresAt = ts + bmCaptchaPassTtlMs();
  await store.savePass(
    {
      passId,
      userId,
      purpose: rec.purpose,
      provider: rec.provider,
      createdAt: ts,
      expiresAt,
      consumed: false,
    },
    bmCaptchaPassTtlMs(),
  );

  log.info("bm_captcha.verified", { userId, provider: rec.provider, passId });
  return { ok: true, passToken: passId, expiresAt };
}

export async function consumeOfferwallPass(input: {
  userId: number;
  provider: BmCaptchaProvider;
  passToken: string | undefined;
}): Promise<ConsumePassResult> {
  if (!bmCaptchaEnabled()) return { ok: true };
  if (!bmCaptchaHmacSecret()) {
    log.error("bm_captcha.consume_no_secret");
    return { ok: false, code: "CAPTCHA_MISCONFIGURED", status: 503 };
  }

  const passToken = String(input.passToken || "").trim();
  if (!passToken) {
    return { ok: false, code: "CAPTCHA_PASS_REQUIRED", status: 403 };
  }

  const rec = await store.loadPass(passToken);
  if (!rec || rec.userId !== input.userId) {
    return { ok: false, code: "CAPTCHA_PASS_INVALID", status: 403 };
  }
  if (rec.consumed) {
    return { ok: false, code: "CAPTCHA_PASS_USED", status: 403 };
  }
  if (rec.expiresAt <= Date.now()) {
    return { ok: false, code: "CAPTCHA_PASS_EXPIRED", status: 403 };
  }
  if (rec.purpose !== BM_CAPTCHA_PURPOSE_OFFERWALL_EXTERNAL) {
    return { ok: false, code: "CAPTCHA_PASS_PURPOSE", status: 403 };
  }
  if (rec.provider !== input.provider) {
    return { ok: false, code: "CAPTCHA_PASS_PROVIDER", status: 403 };
  }

  rec.consumed = true;
  await store.updatePass(rec);
  log.info("bm_captcha.pass_consumed", {
    userId: input.userId,
    provider: input.provider,
    passId: rec.passId,
  });
  return { ok: true };
}

export function extractPassToken(req: {
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
}): string | undefined {
  const h = req.headers["x-bm-captcha-pass"];
  if (typeof h === "string" && h.trim()) return h.trim();
  if (Array.isArray(h) && typeof h[0] === "string") return h[0].trim();
  const q = req.query.bmCaptchaPass;
  if (typeof q === "string" && q.trim()) return q.trim();
  return undefined;
}
