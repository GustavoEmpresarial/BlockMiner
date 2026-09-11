/**
 * Presence heartbeat credit (youtube / auto-mining seconds balance). Ported
 * from legacy/server/modules/session/application/session.service.ts.
 *
 * Power Boost is wired: `modules/boosts` shipped, so the boosted credit
 * ceiling now applies (it was hardcoded off while that module was pending —
 * boosted users lost ~40s of every throttled background beat). Fingerprint
 * decode/validation, elapsed-time credit, flood guard and balance cap match
 * legacy.
 */
import prisma from "../../core/database/prisma.js";
import { hasActiveBoost } from "../boosts/index.js";

const HEARTBEAT_FINGERPRINT_MAX_AGE_MS = Number(process.env.HEARTBEAT_FINGERPRINT_MAX_AGE_MS ?? 6 * 60 * 60 * 1000);
const HEARTBEAT_FINGERPRINT_FUTURE_SKEW_MS = Number(process.env.HEARTBEAT_FINGERPRINT_FUTURE_SKEW_MS ?? 6 * 60 * 60 * 1000);
export const HEARTBEAT_MIN_INTERVAL_MS = Number(process.env.HEARTBEAT_MIN_INTERVAL_MS ?? 3_000);
const HEARTBEAT_MAX_CREDIT_SECONDS = Number(process.env.HEARTBEAT_MAX_CREDIT_SECONDS ?? 20);
/** Background tabs throttle timers to ~1/min. Power Boost users need one beat to cover a full cycle. */
const HEARTBEAT_MAX_CREDIT_SECONDS_BOOSTED = Number(process.env.HEARTBEAT_MAX_CREDIT_SECONDS_BOOSTED ?? 70);
const PRESENCE_BALANCE_CAP = Number(process.env.PRESENCE_BALANCE_CAP ?? 300);

export type FingerprintPayload = { ts?: number; b?: boolean };

export function decodeFingerprint(raw: string | undefined): { ok: true; data: FingerprintPayload } | { ok: false; code: string } {
  if (!raw || typeof raw !== "string" || !raw.trim()) return { ok: false, code: "FINGERPRINT_MISSING" };
  try {
    const json = Buffer.from(raw.trim(), "base64").toString("utf8");
    const data = JSON.parse(json) as FingerprintPayload;
    if (!data || typeof data !== "object") return { ok: false, code: "FINGERPRINT_INVALID_JSON" };
    return { ok: true, data };
  } catch {
    return { ok: false, code: "FINGERPRINT_DECODE_FAILED" };
  }
}

export function fingerprintTimestampValid(ts: unknown): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return true; // legacy clients omit ts
  const nowTs = Date.now();
  if (ts > nowTs + HEARTBEAT_FINGERPRINT_FUTURE_SKEW_MS) return false;
  if (ts < nowTs - HEARTBEAT_FINGERPRINT_MAX_AGE_MS) return false;
  return true;
}

export type HeartbeatResult = { throttled: true } | { throttled: false; credited: number };

async function findHeartbeatClocks(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { ytLastHeartbeatAt: true, autoMiningLastHeartbeatAt: true },
  });
}

async function creditHeartbeatIfUnderCap(
  userId: number,
  balanceField: "ytSecondsBalance" | "autoMiningSecondsBalance",
  clockField: "ytLastHeartbeatAt" | "autoMiningLastHeartbeatAt",
  now: Date,
  credit: number,
  cap: number,
): Promise<number> {
  const result = await prisma.user.updateMany({
    where: { id: userId, [balanceField]: { lt: cap } },
    data: { [clockField]: now, lastHeartbeatAt: now, [balanceField]: { increment: credit } },
  });
  return result.count;
}

async function touchHeartbeatClockOnly(userId: number, clockField: "ytLastHeartbeatAt" | "autoMiningLastHeartbeatAt", now: Date): Promise<void> {
  await prisma.user.updateMany({ where: { id: userId }, data: { [clockField]: now, lastHeartbeatAt: now } });
}

export async function processHeartbeatForUser(userId: number, type: "youtube" | "auto-mining"): Promise<HeartbeatResult> {
  const now = new Date();
  const isYoutube = type === "youtube";
  const clockField = isYoutube ? "ytLastHeartbeatAt" : "autoMiningLastHeartbeatAt";
  const balanceField = isYoutube ? "ytSecondsBalance" : "autoMiningSecondsBalance";

  const user = await findHeartbeatClocks(userId);
  const lastBeat = isYoutube ? user?.ytLastHeartbeatAt : user?.autoMiningLastHeartbeatAt;
  const elapsedMs = lastBeat ? now.getTime() - lastBeat.getTime() : null;

  if (elapsedMs != null && elapsedMs < HEARTBEAT_MIN_INTERVAL_MS) {
    return { throttled: true };
  }

  // Power Boost raises the ceiling so a single throttled (~60s) background beat still funds a
  // full claim cycle. Fail-soft: a boost lookup blip must never black out presence credit.
  let boosted = false;
  try {
    boosted = await hasActiveBoost(userId);
  } catch {
    boosted = false;
  }
  const maxCredit = boosted ? HEARTBEAT_MAX_CREDIT_SECONDS_BOOSTED : HEARTBEAT_MAX_CREDIT_SECONDS;
  const FIRST_BEAT_SEED_SECONDS = 10;
  const credit = elapsedMs == null ? FIRST_BEAT_SEED_SECONDS : Math.max(0, Math.min(maxCredit, Math.round(elapsedMs / 1000)));

  const creditedCount = await creditHeartbeatIfUnderCap(userId, balanceField, clockField, now, credit, PRESENCE_BALANCE_CAP);
  // Balance already at PRESENCE_BALANCE_CAP → the increment's WHERE matched nothing. The clocks
  // still MUST advance or presence goes stale and every later claim fails.
  if (creditedCount === 0) {
    await touchHeartbeatClockOnly(userId, clockField, now);
  }

  // Report what was actually applied — reporting `credit` after a capped no-op told the client it
  // had banked seconds the ledger never received.
  return { throttled: false, credited: creditedCount === 0 ? 0 : credit };
}
