import { getPolUsdPrice } from '../wallet/index.js';
import { miningEngine } from '../mining/index.js';
import type { PeriodKey } from './analytics.types.js';

export const BLOCK_REWARD_POL_FALLBACK = 0.3;
export const BLOCK_DURATION_MS_FALLBACK = 10 * 60 * 1000; // 10 min
export const DEFAULT_FALLBACK_POL_PRICE = 0.35;
export const SITE_LAUNCH_DATE_FALLBACK = '2026-03-05T00:00:00.000Z';

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;

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

  const monthLabel = (d: Date) =>
    d.toLocaleString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const dayBuckets = (count: number) => {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (let i = count - 1; i >= 0; i--) {
      const from = new Date(today - i * MS_DAY);
      buckets.push({
        label: `${from.getUTCDate()}/${from.getUTCMonth() + 1}`,
        from,
        to: new Date(from.getTime() + MS_DAY),
        year: from.getUTCFullYear(),
        month: from.getUTCMonth() + 1,
        day: from.getUTCDate(),
      });
    }
  };
  const monthBuckets = (count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      buckets.push({
        label: monthLabel(from),
        from,
        to: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)),
        year: from.getUTCFullYear(),
        month: from.getUTCMonth() + 1,
      });
    }
  };

  if (period === 'day') {
    bucketUnit = 'hour';
    const currentHour = Math.floor(now.getTime() / MS_HOUR) * MS_HOUR;
    since = new Date(currentHour - 23 * MS_HOUR);
    for (let i = 23; i >= 0; i--) {
      const from = new Date(currentHour - i * MS_HOUR);
      buckets.push({
        label: `${String(from.getUTCHours()).padStart(2, '0')}h`,
        from,
        to: new Date(from.getTime() + MS_HOUR),
        year: from.getUTCFullYear(),
        month: from.getUTCMonth() + 1,
        day: from.getUTCDate(),
        hour: from.getUTCHours(),
      });
    }
  } else if (period === 'week') {
    bucketUnit = 'day';
    since = new Date(now.getTime() - 7 * MS_DAY);
    dayBuckets(7);
  } else if (period === 'year') {
    bucketUnit = 'month';
    since = new Date(now);
    since.setUTCFullYear(since.getUTCFullYear() - 1);
    monthBuckets(12);
  } else if (period === 'all') {
    bucketUnit = 'month';
    since = siteLaunchDate();
    const monthsSinceLaunch = Math.max(
      0,
      (now.getUTCFullYear() - since.getUTCFullYear()) * 12 + (now.getUTCMonth() - since.getUTCMonth())
    );
    monthBuckets(monthsSinceLaunch + 1);
  } else {
    // Default: 'month' (30 days)
    bucketUnit = 'day';
    since = new Date(now);
    since.setUTCMonth(since.getUTCMonth() - 1);
    dayBuckets(30);
  }

  return { period, since, buckets, bucketUnit };
}

export function buildBuckets(period: PeriodKey, now: Date): { since: Date; buckets: AnalyticsBucket[] } {
  const resolved = resolveAnalyticsPeriod(period, now);
  return { since: resolved.since, buckets: resolved.buckets };
}

export function bucketKeyFor(d: Date, unit: BucketUnit, hour?: number): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  if (unit === 'month') {
    return `${y}-${m}`;
  }
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (unit === 'hour') {
    return `${y}-${m}-${day}-${String(hour ?? d.getUTCHours()).padStart(2, '0')}`;
  }
  return `${y}-${m}-${day}`;
}
