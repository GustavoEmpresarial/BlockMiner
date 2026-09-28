/**
 * Offerwall Analytics Service — cross-provider analytics reporting.
 * Reimplemented in strict TypeScript without `@ts-nocheck`.
 */
import { fetchOfferwallAnalyticsRaw } from "./offerwall.repository.js";
import { scoringConfigPayload } from "../tournaments/index.js";
import type {
  OfferwallAnalyticsParams,
  OfferwallAnalyticsReport,
  OfferwallDailyBucket,
  SanitizeDateRangeResult,
} from "./offerwall.types.js";

const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 90;

function parseIsoDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function sanitizeAdminDateRange(fromRaw: unknown, toRaw: unknown): SanitizeDateRangeResult {
  const now = new Date();
  let to = parseIsoDate(toRaw) ?? now;
  if (to.getTime() > now.getTime()) to = now;

  let from = parseIsoDate(fromRaw);
  if (!from) {
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (DEFAULT_RANGE_DAYS - 1));
    from.setUTCHours(0, 0, 0, 0);
  }

  if (from.getTime() > to.getTime()) {
    return { ok: false, message: "from must be before or equal to to" };
  }

  const maxMs = MAX_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) {
    return { ok: false, message: `Date range cannot exceed ${MAX_RANGE_DAYS} days` };
  }

  return { ok: true, range: { from, to, serverNow: now.toISOString() } };
}

export function parseOptionalUserId(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function bucketDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatBrtDay(d: Date): string {
  try {
    return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return bucketDayKey(d);
  }
}

function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

export async function getOfferwallAnalyticsReport(
  params: OfferwallAnalyticsParams,
): Promise<OfferwallAnalyticsReport> {
  const {
    internalAgg,
    omeAgg,
    multiAgg,
    ggAgg,
    zeradsAgg,
    internalRows,
    omeRows,
    multiRows,
    ggRows,
    zeradsRows,
  } = await fetchOfferwallAnalyticsRaw({
    userId: params.userId,
    from: params.from,
    to: params.to,
  });

  const buckets = new Map<string, OfferwallDailyBucket>();

  const ensure = (d: Date): OfferwallDailyBucket => {
    const key = bucketDayKey(d);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        day: key,
        dayBrt: formatBrtDay(d),
        internal: 0,
        internalPol: 0,
        offerwallMe: 0,
        offerwallMePol: 0,
        multiwall: 0,
        multiwallPol: 0,
        offerwallGg: 0,
        offerwallGgPol: 0,
        zeradsCallbacks: 0,
        zeradsClicks: 0,
        zeradsPol: 0,
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  let totalInternalPol = 0;
  for (const r of internalRows) {
    if (!r.completedAt) continue;
    const b = ensure(r.completedAt);
    b.internal += 1;
    const reward = Number(r.offer?.rewardPolAmount ?? 0);
    b.internalPol = round4(b.internalPol + reward);
    totalInternalPol = round4(totalInternalPol + reward);
  }

  let totalOmePol = 0;
  for (const r of omeRows) {
    const b = ensure(r.createdAt);
    b.offerwallMe += 1;
    const reward = Number(r.polCredited ?? 0);
    b.offerwallMePol = round4(b.offerwallMePol + reward);
    totalOmePol = round4(totalOmePol + reward);
  }

  let totalMultiPol = 0;
  for (const r of multiRows) {
    const b = ensure(r.createdAt);
    b.multiwall += 1;
    const reward = Number(r.polCredited ?? 0);
    b.multiwallPol = round4(b.multiwallPol + reward);
    totalMultiPol = round4(totalMultiPol + reward);
  }

  let totalGgPol = 0;
  for (const r of ggRows) {
    const b = ensure(r.createdAt);
    b.offerwallGg += 1;
    const reward = Number(r.polCredited ?? 0);
    b.offerwallGgPol = round4(b.offerwallGgPol + reward);
    totalGgPol = round4(totalGgPol + reward);
  }

  let totalZeradsPol = 0;
  let totalZeradsClicks = 0;
  for (const r of zeradsRows) {
    const b = ensure(r.callbackAt);
    b.zeradsCallbacks += 1;
    const clicks = Number(r.clicks ?? 0);
    const payout = Number(r.payoutAmount ?? 0);
    b.zeradsClicks += clicks;
    b.zeradsPol = round4(b.zeradsPol + payout);
    totalZeradsClicks += clicks;
    totalZeradsPol = round4(totalZeradsPol + payout);
  }

  const daily = Array.from(buckets.values()).sort((a, b) => a.day.localeCompare(b.day));

  const serverNowDate = new Date(params.serverNow);
  const serverNowBrt = serverNowDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return {
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    serverNow: params.serverNow,
    serverNowBrt,
    userId: params.userId,
    scoringConfig: scoringConfigPayload(),
    totals: {
      internal: {
        count: internalAgg._count.id,
        pol: totalInternalPol,
      },
      offerwallMe: {
        count: omeAgg._count.id,
        pol: round4(Number(omeAgg._sum.polCredited ?? 0)),
      },
      multiwall: {
        count: multiAgg._count.id,
        pol: round4(Number(multiAgg._sum.polCredited ?? 0)),
      },
      offerwallGg: {
        count: ggAgg._count.id,
        pol: round4(Number(ggAgg._sum.polCredited ?? 0)),
      },
      zerads: {
        callbacks: zeradsAgg._count.id,
        clicks: Number(zeradsAgg._sum.clicks ?? 0),
        pol: round4(Number(zeradsAgg._sum.payoutAmount ?? 0)),
      },
    },
    daily,
  };
}
