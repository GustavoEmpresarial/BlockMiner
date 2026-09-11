// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/offerwall/application/offerwall.service.ts.
 *
 * Architectural note (offerwall vs offerwallme vs internal-offerwall):
 * In legacy, `offerwall/` is NOT a fourth reward-granting integration — it has no postback/
 * claim endpoints of its own and grants nothing. It is a thin admin-only cross-cutting
 * analytics aggregator that reads across three independent integrations that DO grant
 * rewards: internal-offerwall (self-hosted offer catalog), offerwallme (offerwall.me
 * external provider), and Zerads (owned by the parallel traffic/zerads work, out of this
 * module's scope but its Prisma model — ZeradsCallback — is a pure read here, same as
 * legacy). This module is kept because it IS a real, distinct functional boundary (admin
 * reporting across providers), not because it duplicates any provider's logic — it never
 * touches offer/session state or reward crediting, only aggregates already-written rows.
 * Ported as-is: a read-only admin.service, not merged into offerwallme or internal-offerwall.
 *
 * Deviations:
 * - `scoringConfig` reinstated via tournaments.scoringConfigPayload() (Fase 7).
 * - legacy's admin date-range sanitizer (`utils/sanitizeAdminDateRange.ts`) formatted a
 *   `serverNowBrt` field using `America/Sao_Paulo`. current/'s explicit product decision is
 *   UTC-only day boundaries (see shared/calendar/utcCalendar.ts) — the BRT-formatted field
 *   and the BRT-bucketed `dayBrt` per-day label are dropped; `day`/`serverNow` are UTC ISO.
 */
import { fetchOfferwallAnalyticsRaw } from "./offerwall.repository.js";
import { scoringConfigPayload } from "../tournaments/index.js";
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 90;
function parseIsoDate(raw) {
    if (raw == null || raw === "")
        return null;
    if (typeof raw !== "string")
        return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}
export function sanitizeAdminDateRange(fromRaw, toRaw) {
    const now = new Date();
    let to = parseIsoDate(toRaw) ?? now;
    if (to.getTime() > now.getTime())
        to = now;
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
export function parseOptionalUserId(raw) {
    if (raw == null || raw === "")
        return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0)
        return null;
    return n;
}
function bucketDayKey(d) {
    return d.toISOString().slice(0, 10);
}
export async function getOfferwallAnalyticsReport(params) {
    const { internalAgg, omeAgg, zeradsAgg, internalRows, omeRows, zeradsRows } = await fetchOfferwallAnalyticsRaw({
        userId: params.userId,
        from: params.from,
        to: params.to,
    });
    const internalPol = internalRows.reduce((s, r) => s + Number(r.offer?.rewardPolAmount ?? 0), 0);
    const buckets = new Map();
    const ensure = (key) => {
        if (!buckets.has(key)) {
            buckets.set(key, { day: key, internal: 0, internalPol: 0, offerwallMe: 0, offerwallMePol: 0, zeradsCallbacks: 0, zeradsClicks: 0, zeradsPol: 0 });
        }
        return buckets.get(key);
    };
    for (const r of internalRows) {
        if (!r.completedAt)
            continue;
        const b = ensure(bucketDayKey(r.completedAt));
        b.internal += 1;
        b.internalPol += Number(r.offer?.rewardPolAmount ?? 0);
    }
    for (const r of omeRows) {
        const b = ensure(bucketDayKey(r.createdAt));
        b.offerwallMe += 1;
        b.offerwallMePol += Number(r.polCredited ?? 0);
    }
    for (const r of zeradsRows) {
        const b = ensure(bucketDayKey(r.callbackAt));
        b.zeradsCallbacks += 1;
        b.zeradsClicks += Number(r.clicks ?? 0);
        b.zeradsPol += Number(r.payoutAmount ?? 0);
    }
    const daily = Array.from(buckets.values()).sort((a, b) => a.day.localeCompare(b.day));
    return {
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        serverNow: params.serverNow,
        userId: params.userId,
        scoringConfig: scoringConfigPayload(),
        totals: {
            internal: { count: internalAgg._count.id, pol: internalPol },
            offerwallMe: { count: omeAgg._count.id, pol: Number(omeAgg._sum.polCredited ?? 0) },
            zerads: {
                callbacks: zeradsAgg._count.id,
                clicks: Number(zeradsAgg._sum.clicks ?? 0),
                pol: Number(zeradsAgg._sum.payoutAmount ?? 0),
            },
        },
        daily,
    };
}
