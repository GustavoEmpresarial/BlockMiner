import type { WalletBalancePayload } from './dashboard.api';
import type { DashboardWalletBalances } from './dashboardBalanceCurrency';
import {
  DASHBOARD_REFERRAL_CODE_MAX_LEN,
  DASHBOARD_BLOCK_COUNTDOWN_RESYNC_SECONDS,
} from './dashboard.config';

export function mapWalletBalancePayload(payload: WalletBalancePayload): DashboardWalletBalances {
  const pol = Number(payload.balance ?? payload.polBalance ?? 0);
  return {
    POL: Number.isFinite(pol) ? pol : 0,
    SHIB: Number(payload.shibBalance) || 0,
    BLK: Number(payload.blkBalance) || 0,
  };
}

/** Public origin for invite links — never point friends at staging/dev when browsing there. */
export function publicSiteOrigin(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'dev.blockminer.space' || host.endsWith('.dev.blockminer.space')) {
      return 'https://blockminer.space';
    }
  }
  const baked =
    typeof process !== 'undefined'
      ? String((process as { env?: { APP_URL?: string } }).env?.APP_URL ?? '')
          .trim()
          .replace(/\/$/, '')
      : '';
  if (baked && /^https?:\/\//i.test(baked) && !/localhost|127\.0\.0\.1/i.test(baked)) {
    return baked;
  }
  if (typeof window !== 'undefined') return window.location.origin;
  return 'https://blockminer.space';
}

export function buildReferralRegisterUrl(userId: number, refCode: string | null | undefined): string {
  const origin = publicSiteOrigin();
  const code = refCode?.trim() || String(userId);
  return `${origin}/register?ref=${encodeURIComponent(code)}`;
}

export function sanitizeReferralInput(raw: string): string {
  const trimmed = stripControlChars(String(raw ?? '').trim()).slice(0, DASHBOARD_REFERRAL_CODE_MAX_LEN);
  if (/^\d+$/.test(trimmed)) {
    return trimmed.replace(/^0+/, '') || '0';
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function displayDashboardUserName(name: string | null | undefined): string {
  const cleaned = stripControlChars(String(name ?? '')).slice(0, 120);
  return cleaned || '—';
}

function stripControlChars(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) continue;
    out += value[i];
  }
  return out;
}

export type BlockCountdownAnchor = {
  fetchedAtMs: number;
  countdownAtFetch: number;
  durationSeconds: number;
};

export function nextBlockCountdownAnchor(
  payload: { blockCountdownSeconds?: unknown; blockIntervalMinutes?: unknown },
  previous: BlockCountdownAnchor | null,
  nowMs: number,
): BlockCountdownAnchor {
  const nextCd = Number(payload.blockCountdownSeconds ?? 0);
  const nextDur = Math.max(1, Number(payload.blockIntervalMinutes ?? 10) * 60);
  if (!previous) {
    return { fetchedAtMs: nowMs, countdownAtFetch: nextCd, durationSeconds: nextDur };
  }
  const localRem = Math.max(0, previous.countdownAtFetch - (nowMs - previous.fetchedAtMs) / 1000);
  if (Math.abs(localRem - nextCd) > DASHBOARD_BLOCK_COUNTDOWN_RESYNC_SECONDS) {
    return { fetchedAtMs: nowMs, countdownAtFetch: nextCd, durationSeconds: nextDur };
  }
  return previous;
}

export function smoothedBlockCountdownSeconds(anchor: BlockCountdownAnchor | null, nowMs: number): number {
  if (!anchor) return 0;
  const elapsed = (nowMs - anchor.fetchedAtMs) / 1000;
  return Math.max(0, anchor.countdownAtFetch - elapsed);
}

export function pendingPolAccrual(params: {
  networkHashRate: number;
  userHashRate: number;
  blockRewardPol: number;
  countdownSeconds: number;
  blockDurationSeconds: number;
}): number {
  const { networkHashRate, userHashRate, blockRewardPol, countdownSeconds, blockDurationSeconds } = params;
  const share =
    networkHashRate > 0 ? userHashRate / networkHashRate : userHashRate > 0 ? 1 : 0;
  const progress = Math.min(1, Math.max(0, 1 - countdownSeconds / Math.max(1, blockDurationSeconds)));
  return share * blockRewardPol * progress;
}
