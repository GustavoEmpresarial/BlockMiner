/**
 * Cloudflare Turnstile gate for mini-game rewards: every N rewarded plays
 * requires a fresh Turnstile token before granting power.
 *
 * Counter = lifetime `userPowerGame` rows for the user (all game rewards).
 * Captcha is due on the Nth, 2Nth, … reward (`(count + 1) % N === 0`).
 *
 * Disabled when `GAME_TURNSTILE_EVERY_N=0` or Turnstile secret is unset.
 *
 * Clients may either send `cfTurnstileToken` on game:start / 2048 claim, or
 * POST /api/games/turnstile-pass after solving (one-shot pass, consumed on grant).
 */
import type { PrismaClient } from "@prisma/client";
import {
  isTurnstileEnforced,
  resolveTurnstileSecret,
  verifyTurnstileToken,
} from "../../shared/security/turnstile.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("games.turnstile");

const DEFAULT_GAME_TURNSTILE_EVERY_N = 10;
const DEFAULT_GAME_TURNSTILE_PASS_TTL_MS = 15 * 60 * 1000;

function envPositiveInt(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function gameTurnstileEveryN(): number {
  return envPositiveInt("GAME_TURNSTILE_EVERY_N", DEFAULT_GAME_TURNSTILE_EVERY_N);
}

export function gameTurnstilePassTtlMs(): number {
  return envPositiveInt("GAME_TURNSTILE_PASS_TTL_MS", DEFAULT_GAME_TURNSTILE_PASS_TTL_MS);
}

export function gameTurnstileGateActive(): boolean {
  return gameTurnstileEveryN() > 0 && isTurnstileEnforced();
}

const turnstilePasses = new Map<number, number>();

export function clearExpiredGameTurnstilePasses(now = Date.now()): void {
  for (const [userId, exp] of turnstilePasses) {
    if (exp <= now) turnstilePasses.delete(userId);
  }
}

export function hasGameTurnstilePass(userId: number, now = Date.now()): boolean {
  const exp = turnstilePasses.get(userId);
  if (exp == null) return false;
  if (exp <= now) {
    turnstilePasses.delete(userId);
    return false;
  }
  return true;
}

export function consumeGameTurnstilePass(userId: number): boolean {
  if (!hasGameTurnstilePass(userId)) return false;
  turnstilePasses.delete(userId);
  return true;
}

export function grantGameTurnstilePass(userId: number, now = Date.now()): void {
  turnstilePasses.set(userId, now + gameTurnstilePassTtlMs());
}

export type GameTurnstileStatus = {
  active: boolean;
  everyN: number;
  rewardedCount: number;
  required: boolean;
  remainingUntilRequired: number;
  hasPass: boolean;
};

export async function getGameTurnstileStatus(
  prisma: PrismaClient,
  userId: number,
): Promise<GameTurnstileStatus> {
  clearExpiredGameTurnstilePasses();
  const everyN = gameTurnstileEveryN();
  const active = everyN > 0 && isTurnstileEnforced();
  const rewardedCount = await prisma.userPowerGame.count({ where: { userId } });
  const hasPass = hasGameTurnstilePass(userId);
  if (!active) {
    return {
      active: false,
      everyN,
      rewardedCount,
      required: false,
      remainingUntilRequired: everyN > 0 ? everyN : 0,
      hasPass: false,
    };
  }
  const nextIndex = rewardedCount + 1;
  const required = nextIndex % everyN === 0 && !hasPass;
  const rem = nextIndex % everyN === 0 ? 0 : everyN - (nextIndex % everyN);
  return {
    active: true,
    everyN,
    rewardedCount,
    required,
    remainingUntilRequired: rem,
    hasPass,
  };
}

export async function submitGameTurnstilePass(
  userId: number,
  cfTurnstileToken: unknown,
  remoteIp: string | undefined,
): Promise<{ ok: true } | { ok: false; code: "CAPTCHA_REQUIRED" | "CAPTCHA_FAILED" | "GATE_INACTIVE" }> {
  if (!gameTurnstileGateActive()) {
    return { ok: false, code: "GATE_INACTIVE" };
  }
  const secret = resolveTurnstileSecret();
  const result = await verifyTurnstileToken(cfTurnstileToken, remoteIp, { secret });
  if (!result.ok) return { ok: false, code: result.code };
  grantGameTurnstilePass(userId);
  log.info("game_turnstile_pass_granted", { userId });
  return { ok: true };
}

export type GameTurnstileGateResult =
  | { ok: true; required: boolean }
  | { ok: false; code: "CAPTCHA_REQUIRED" | "CAPTCHA_FAILED"; required: true };

export async function assertGameTurnstileForReward(
  prisma: PrismaClient,
  userId: number,
  cfTurnstileToken: unknown,
  remoteIp: string | undefined,
): Promise<GameTurnstileGateResult> {
  clearExpiredGameTurnstilePasses();
  const everyN = gameTurnstileEveryN();
  const active = everyN > 0 && isTurnstileEnforced();
  if (!active) return { ok: true, required: false };

  const rewardedCount = await prisma.userPowerGame.count({ where: { userId } });
  const due = (rewardedCount + 1) % everyN === 0;
  if (!due) return { ok: true, required: false };

  const token = typeof cfTurnstileToken === "string" ? cfTurnstileToken.trim() : "";
  if (token) {
    const secret = resolveTurnstileSecret();
    const result = await verifyTurnstileToken(token, remoteIp, { secret });
    if (!result.ok) {
      if (consumeGameTurnstilePass(userId)) return { ok: true, required: true };
      log.warn("game_turnstile_blocked", { userId, code: result.code, rewardedCount });
      return { ok: false, code: result.code, required: true };
    }
    turnstilePasses.delete(userId);
    return { ok: true, required: true };
  }

  if (consumeGameTurnstilePass(userId)) {
    return { ok: true, required: true };
  }

  log.warn("game_turnstile_blocked", { userId, code: "CAPTCHA_REQUIRED", rewardedCount });
  return { ok: false, code: "CAPTCHA_REQUIRED", required: true };
}
