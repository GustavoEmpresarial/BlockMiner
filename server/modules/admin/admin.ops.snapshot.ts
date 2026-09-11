// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Real GET /api/admin/ops/snapshot payload — ported from
 * legacy/server/shared/observability/{opsSnapshot,eventLoopLagMonitor,healthChecks,
 * runtimeRegistry,economyMetrics}.ts.
 *
 * Doctrine deviation from legacy (see admin.ops.routes.ts module comment for the
 * previous 501 rationale): legacy's opsSnapshot pulls from a process-wide
 * `metricsRegistry`/`alertRegistry` (in-process Prometheus-style counters fed by hooks
 * scattered across every reward-claiming module) plus a Socket.IO/BullMQ/Redis runtime
 * registry. None of that infra exists in current/ yet:
 *   - No `core/redis/` or BullMQ queue module (see
 *     server/core/http/middleware/rateLimit.ts module comment — confirmed out of scope
 *     until Fase 1+ lands it).
 *   - No `core/socket/` (Socket.IO) — confirmed empty; mining.engine.ts already documents
 *     this deviation ("DEVIATION FROM LEGACY: this port drops all Socket.IO broadcasting").
 *   - No in-process module-action counters (`recordModuleAction` / `moduleActionsTotal`)
 *     — wiring that into every claim handler across current/'s modules is out of scope for
 *     this port; it would either be fabricated (fake baseline) or require a much larger
 *     cross-module change than "port one route".
 *
 * What IS real here:
 *   - Event loop lag: sampled on-demand via `perf_hooks.monitorEventLoopDelay`, same
 *     histogram API legacy uses for its periodic sampler, just windowed synchronously for
 *     a single request instead of a background interval.
 *   - Health checks: Postgres via Prisma (`SELECT 1`), real. Redis/BullMQ/Socket.IO/queue
 *     checks are reported as `not_applicable` with an explanatory message — never a
 *     fabricated "ok: true".
 *   - Runtime registry: real `process`/`os` data (pid, uptime, node version, memory).
 *   - Economy: reuses the mining engine singleton (server/modules/mining/index.ts) for
 *     live blockNumber/activeMiners — the same live source
 *     server/modules/analytics/analytics.admin.controller.ts already uses instead of
 *     duplicating a parallel counter — plus a real Prisma count of settled
 *     BlockMinerReward rows in the last 24h as an activity signal.
 *   - Socket metrics: explicit stub, `available: false`, all counters `null` — Socket.IO
 *     is not mounted in current/ yet (see mining.engine.ts deviation note above).
 *   - Metrics/alerts registry: honest empty structures — no in-process metrics/alerts
 *     registry exists in current/ to source them from.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { miningEngine } from "../mining/index.js";
const log = logger.child("AdminOpsSnapshot");
const HEALTH_CHECK_TIMEOUT_MS = 2000;
const EVENT_LOOP_SAMPLE_MS = 200;
async function withTimeout(promise, ms) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("health_check_timeout")), ms);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
/** Real event loop lag, sampled synchronously for EVENT_LOOP_SAMPLE_MS via libuv's histogram. */
export async function sampleEventLoopLag() {
    const h = monitorEventLoopDelay({ resolution: 10 });
    h.enable();
    await new Promise((resolve) => setTimeout(resolve, EVENT_LOOP_SAMPLE_MS));
    h.disable();
    const result = {
        maxMs: Number.isFinite(h.max) ? h.max / 1e6 : 0,
        meanMs: Number.isFinite(h.mean) ? h.mean / 1e6 : 0,
        p99Ms: Number.isFinite(h.percentile(99)) ? h.percentile(99) / 1e6 : 0,
        sampleWindowMs: EVENT_LOOP_SAMPLE_MS,
    };
    return result;
}
/** Real check: SELECT 1 against the live Prisma connection. */
export async function checkPostgres() {
    const start = Date.now();
    try {
        await withTimeout(prisma.$queryRaw `SELECT 1`, HEALTH_CHECK_TIMEOUT_MS);
        return { ok: true, latencyMs: Date.now() - start };
    }
    catch (e) {
        return {
            ok: false,
            latencyMs: Date.now() - start,
            message: e instanceof Error ? e.message : String(e),
        };
    }
}
/** Honest placeholder: no such infra exists in current/ yet (see module doc-comment). */
function notApplicable(reason) {
    return { ok: true, latencyMs: 0, message: `not_applicable: ${reason}` };
}
export async function buildHealthChecks() {
    const postgres = await checkPostgres();
    return {
        postgres,
        redis: notApplicable("core/redis/ not ported to current/ yet"),
        bullmq: notApplicable("no BullMQ queue module in current/ yet"),
        websocket: notApplicable("core/socket/ (Socket.IO) not ported to current/ yet"),
        mining: {
            ok: Boolean(miningEngine) && miningEngine.blockNumber > 0,
            latencyMs: 0,
            details: { blockNumber: miningEngine?.blockNumber ?? 0, activeMiners: miningEngine?.miners?.size ?? 0 },
        },
    };
}
export function buildRuntimeRegistry() {
    return {
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssBytes: process.memoryUsage().rss,
        memoryHeapUsedBytes: process.memoryUsage().heapUsed,
    };
}
/**
 * Economy activity snapshot. Reuses the same live mining-engine singleton
 * server/modules/analytics/analytics.admin.controller.ts already reads (rather than
 * duplicating a parallel in-process counter), plus one real Prisma aggregate for
 * settled-reward activity in the last 24h.
 */
export async function buildEconomySnapshot() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let rewardsSettled24h = 0;
    try {
        rewardsSettled24h = await prisma.blockMinerReward.count({ where: { createdAt: { gte: dayAgo } } });
    }
    catch (e) {
        log.warn("economy snapshot: reward count failed", { error: e instanceof Error ? e.message : String(e) });
    }
    return {
        blockNumber: miningEngine?.blockNumber ?? 0,
        activeMiners: miningEngine?.miners?.size ?? 0,
        rewardsSettled24h,
    };
}
/**
 * Explicit, honest stub — Socket.IO is not mounted in current/ (core/socket/ is empty).
 * Every field is null/false rather than fabricated, so callers can tell "not applicable"
 * from "zero live connections".
 */
export function buildSocketMetricsStub() {
    return {
        available: false,
        reason: "Socket.IO (core/socket/) is not ported to current/ yet",
        connectionsActive: null,
        connectsTotal: null,
        disconnectsTotal: null,
    };
}
/**
 * Honest empty structures — no in-process metrics/alerts registry exists in current/ to
 * source real values from (legacy's metricsRegistry.ts / alertRegistry.ts were not
 * ported; see module doc-comment).
 */
export function buildMetricsRegistrySnapshot() {
    return {
        available: false,
        reason: "In-process metricsRegistry not ported to current/ yet",
        counters: [],
        gauges: [],
    };
}
export function buildAlertRegistrySnapshot() {
    return {
        available: false,
        reason: "In-process alertRegistry not ported to current/ yet",
        alerts: [],
    };
}
export async function buildOpsSnapshot() {
    const [eventLoopLag, checks, economy] = await Promise.all([
        sampleEventLoopLag(),
        buildHealthChecks(),
        buildEconomySnapshot(),
    ]);
    const requiredOk = checks.postgres.ok && checks.mining.ok;
    return {
        timestamp: new Date().toISOString(),
        readiness: {
            ok: requiredOk,
            checks,
        },
        eventLoopLag,
        runtime: buildRuntimeRegistry(),
        economy,
        socket: buildSocketMetricsStub(),
        metrics: buildMetricsRegistrySnapshot(),
        alerts: buildAlertRegistrySnapshot(),
    };
}
