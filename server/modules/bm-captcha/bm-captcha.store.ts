/**
 * Challenge/pass store — in-process Map with TTL (single app container).
 * Redis optional later; Map is enough for captcha TTL (2–3 min).
 */
import type { BmCaptchaChallengeSecret, BmCaptchaPassRecord } from "./bm-captcha.types.js";

const chalMem = new Map<string, { exp: number; raw: string }>();
const passMem = new Map<string, { exp: number; raw: string }>();
const mintMem = new Map<string, { count: number; resetAt: number }>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;

function ensureSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of chalMem) if (v.exp <= now) chalMem.delete(k);
    for (const [k, v] of passMem) if (v.exp <= now) passMem.delete(k);
    for (const [k, v] of mintMem) if (v.resetAt <= now) mintMem.delete(k);
  }, 30_000);
  if (typeof sweepTimer === "object" && sweepTimer && "unref" in sweepTimer) {
    sweepTimer.unref();
  }
}

export async function saveChallenge(rec: BmCaptchaChallengeSecret, ttlMs: number): Promise<void> {
  ensureSweep();
  void ttlMs;
  chalMem.set(rec.challengeId, { exp: rec.expiresAt, raw: JSON.stringify(rec) });
}

export async function loadChallenge(id: string): Promise<BmCaptchaChallengeSecret | null> {
  const hit = chalMem.get(id);
  if (!hit) return null;
  if (hit.exp <= Date.now()) {
    chalMem.delete(id);
    return null;
  }
  return JSON.parse(hit.raw) as BmCaptchaChallengeSecret;
}

export async function updateChallenge(rec: BmCaptchaChallengeSecret): Promise<void> {
  await saveChallenge(rec, Math.max(1, rec.expiresAt - Date.now()));
}

export async function deleteChallenge(id: string): Promise<void> {
  chalMem.delete(id);
}

export async function savePass(rec: BmCaptchaPassRecord, ttlMs: number): Promise<void> {
  ensureSweep();
  void ttlMs;
  passMem.set(rec.passId, { exp: rec.expiresAt, raw: JSON.stringify(rec) });
}

export async function loadPass(id: string): Promise<BmCaptchaPassRecord | null> {
  const hit = passMem.get(id);
  if (!hit) return null;
  if (hit.exp <= Date.now()) {
    passMem.delete(id);
    return null;
  }
  return JSON.parse(hit.raw) as BmCaptchaPassRecord;
}

export async function updatePass(rec: BmCaptchaPassRecord): Promise<void> {
  await savePass(rec, Math.max(1, rec.expiresAt - Date.now()));
}

export async function tryConsumeMintQuota(userId: number, max: number, windowMs: number): Promise<boolean> {
  ensureSweep();
  const key = `bmc:mint:${userId}`;
  const now = Date.now();
  let row = mintMem.get(key);
  if (!row || row.resetAt <= now) {
    row = { count: 0, resetAt: now + windowMs };
    mintMem.set(key, row);
  }
  row.count += 1;
  return row.count <= max;
}
