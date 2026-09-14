/**
 * Self-contained in-memory email-2FA challenge issuance/verification.
 *
 * `issueEmailTwoFactorChallenge` sends the code via the real transactional
 * mailer (shared/security/mailer.ts) — matches legacy's
 * `services/emailTwoFactorService.ts` behavior. Caller (login.controller.ts)
 * already gates this path on `isSmtpConfigured()` before reaching here.
 */
import crypto from "node:crypto";
import { sendLoginTwoFactorCodeEmail } from "../../../shared/security/mailer.js";

const CHALLENGE_TTL_MS = 10 * 60_000;
export const EMAIL_TWO_FACTOR_MAX_FAILED_ATTEMPTS = 5;

type Challenge = { code: string; userId: number; expiresAt: number; failedAttempts: number };
const challenges = new Map<string, Challenge>();

function cleanup(): void {
  const now = Date.now();
  for (const [token, c] of challenges) {
    if (c.expiresAt <= now) challenges.delete(token);
  }
}

function timingSafeUtf8Equal(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  if (expectedBuf.length !== providedBuf.length) {
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export async function issueEmailTwoFactorChallenge(input: {
  userId: number;
  email: string;
  name: string;
}): Promise<{ ok: true; challengeToken: string; ttlMinutes: number }> {
  cleanup();
  const challengeToken = crypto.randomBytes(24).toString("base64url");
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const ttlMinutes = Math.round(CHALLENGE_TTL_MS / 60_000);
  challenges.set(challengeToken, {
    code,
    userId: input.userId,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    failedAttempts: 0,
  });
  try {
    await sendLoginTwoFactorCodeEmail({ to: input.email, name: input.name, code, ttlMinutes });
  } catch (err) {
    challenges.delete(challengeToken);
    throw err;
  }
  return { ok: true, challengeToken, ttlMinutes };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "EXPIRED" | "INVALID" };

export function verifyEmailTwoFactorChallenge(input: {
  challengeToken?: string;
  code?: string;
  userId: number;
}): VerifyResult {
  const entry = input.challengeToken ? challenges.get(input.challengeToken) : undefined;
  if (!entry) return { ok: false, reason: "INVALID" };
  if (entry.expiresAt <= Date.now()) {
    challenges.delete(input.challengeToken!);
    return { ok: false, reason: "EXPIRED" };
  }
  const codeOk = timingSafeUtf8Equal(entry.code, String(input.code ?? ""));
  const userOk = entry.userId === input.userId;
  if (!codeOk || !userOk) {
    entry.failedAttempts += 1;
    if (entry.failedAttempts >= EMAIL_TWO_FACTOR_MAX_FAILED_ATTEMPTS) {
      challenges.delete(input.challengeToken!);
    }
    return { ok: false, reason: "INVALID" };
  }
  challenges.delete(input.challengeToken!);
  return { ok: true };
}
