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

type Challenge = { code: string; userId: number; expiresAt: number };
const challenges = new Map<string, Challenge>();

function cleanup(): void {
  const now = Date.now();
  for (const [token, c] of challenges) {
    if (c.expiresAt <= now) challenges.delete(token);
  }
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
  challenges.set(challengeToken, { code, userId: input.userId, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  await sendLoginTwoFactorCodeEmail({ to: input.email, name: input.name, code, ttlMinutes });
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
  if (entry.userId !== input.userId || entry.code !== input.code) {
    return { ok: false, reason: "INVALID" };
  }
  challenges.delete(input.challengeToken!);
  return { ok: true };
}
