import { getPolUsdPrice } from '../wallet/index.js';
import { miningEngine } from '../mining/index.js';
import type { PeriodKey } from './analytics.types.js';

export const BLOCK_REWARD_POL_FALLBACK = 0.3;
export const BLOCK_DURATION_MS_FALLBACK = 10 * 60 * 1000; // 10 min
export const DEFAULT_FALLBACK_POL_PRICE = 0.35;
export const SITE_LAUNCH_DATE_FALLBACK = '2026-03-05T00:00:00.000Z';

export function parsePeriodParam(raw: unknown): PeriodKey {
  const s = String(raw ?? 'month').trim().toLowerCase();
  if (s === 'day' || s === 'week' || s === 'year' || s === 'all') {
    return s;
  }
  return 'month';
}

export function queryPositiveInt(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const raw = Array.isArray(v) ? v[0] : v;
  const s = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '';
  if (!/^\d{1,12}$/.test(s)) return undefined;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) return undefined;
  return n;
}

export function siteLaunchDate(): Date {
  const raw = String(process.env.SITE_LAUNCH_DATE ?? '2026-03-05').trim();
  const fallback = new Date(SITE_LAUNCH_DATE_FALLBACK);
  if (!raw) return fallback;
  const candidate = raw.includes('T') ? raw : `${raw}T00:00:00.000Z`;
  const d = new Date(candidate);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export interface MiningEconomySnapshot {
  rewardBase: number;
  blockDurationMs: number;
  blockDurationMinutes: number;
  blocksPerDay: number;
  blocksPerMonth: number;
  blocksPerYear: number;
  polPrice: number;
}

export async function getMiningEconomySnapshot(): Promise<MiningEconomySnapshot> {
  let rewardBase = BLOCK_REWARD_POL_FALLBACK;
  let blockDurationMs = BLOCK_DURATION_MS_FALLBACK;
  try {
    if (Number.isFinite(Number(miningEngine.rewardBase))) {
      rewardBase = Number(miningEngine.rewardBase);
    }
    if (
      Number.isFinite(Number(miningEngine.blockDurationMs)) &&
      Number(miningEngine.blockDurationMs) > 0
    ) {
      blockDurationMs = Number(miningEngine.blockDurationMs);
    }
  } catch {
    // Engine not booted in some tests or scripts
  }

  let polPrice = DEFAULT_FALLBACK_POL_PRICE;
  try {
    const p = await getPolUsdPrice();
    if (typeof p === 'number' && Number.isFinite(p) && p > 0) {
      polPrice = p;
    }
  } catch {
    // Retain fallback price
  }

  const blocksPerDay = (24 * 60 * 60 * 1000) / blockDurationMs;
  const blocksPerMonth = blocksPerDay * 30;
  const blocksPerYear = blocksPerDay * 365;

  return {
    rewardBase,
    blockDurationMs,
    blockDurationMinutes: blockDurationMs / 60000,
    blocksPerDay,
    blocksPerMonth,
    blocksPerYear,
    polPrice,
  };
}

export interface AnalyticsBucket {
  label: string;
  from: Date;
  to: Date;
  year: number;
  month: number;
  day?: number;
  hour?: number;
}

export type BucketUnit = 'hour' | 'day' | 'month';

export interface ResolvedPeriod {
  period: PeriodKey;
  since: Date;
  buckets: AnalyticsBucket[];
  bucketUnit: BucketUnit;
}

export function resolveAnalyticsPeriod(raw: unknown, now = new Date()): ResolvedPeriod {
  const period = parsePeriodParam(raw);
  const buckets: AnalyticsBucket[] = [];
  let since: Date;
  let bucketUnit: BucketUnit;

  if (period === 'day') {
    bucketUnit = 'hour';
    since = new Date(now);
    since.setHours(since.getHours() - 23, 0, 0, 0);
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(d.getHours() - i, 0, 0, 0);
      const end = new Date(d);
      end.setHours(end.getHours() + 1);
      buckets.push({
        label: `${String(d.getHours()).padStart(2, '0')}h`,
        from: d,
        to: end,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
        hour: d.getHours(),
      });
    }
  } else if (period === 'week') {
    bucketUnit = 'day';
    since = new Date(now);
    since.setDate(since.getDate() - 7);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
      buckets.push({
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        from: startOfDay,
        to: endOfDay,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      });
    }
  } else if (period === 'year') {
    bucketUnit = 'month';
    since = new Date(now);
    since.setFullYear(since.getFullYear() - 1);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      buckets.push({
        label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
        from: d,
        to: endOfMonth,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      });
    }
  } else if (period === 'all') {
    bucketUnit = 'month';
    since = siteLaunchDate();
    const monthsSinceLaunch = Math.max(
      0,
      (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth())
    );
    for (let i = monthsSinceLaunch; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      buckets.push({
        label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }),
        from: d,
        to: endOfMonth,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
      });
    }
  } else {
    // Default: 'month' (30 days)
    bucketUnit = 'day';
    since = new Date(now);
    since.setMonth(since.getMonth() - 1);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
      buckets.push({
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        from: startOfDay,
        to: endOfDay,
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate(),
      });
    }
  }

  return { period, since, buckets, bucketUnit };
}

export function buildBuckets(period: PeriodKey, now: Date): { since: Date; buckets: AnalyticsBucket[] } {
  const resolved = resolveAnalyticsPeriod(period, now);
  return { since: resolved.since, buckets: resolved.buckets };
}

export function bucketKeyFor(d: Date, unit: BucketUnit, hour?: number): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  if (unit === 'month') {
    return `${y}-${m}`;
  }
  const day = String(d.getDate()).padStart(2, '0');
  if (unit === 'hour') {
    return `${y}-${m}-${day}-${String(hour ?? d.getHours() ?? 0).padStart(2, '0')}`;
  }
  return `${y}-${m}-${day}`;
}
