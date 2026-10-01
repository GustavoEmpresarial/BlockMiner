/**
 * Real GET /api/admin/ops/snapshot payload.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { miningEngine } from "../mining/index.js";

const log = logger.child("AdminOpsSnapshot");
const HEALTH_CHECK_TIMEOUT_MS = 2000;
const EVENT_LOOP_SAMPLE_MS = 200;

export interface EventLoopLagSnapshot {
  maxMs: number;
  meanMs: number;
  p99Ms: number;
  sampleWindowMs: number;
}

export interface HealthCheckResult {
  ok: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthChecksSnapshot {
  postgres: HealthCheckResult;
  redis: HealthCheckResult;
  bullmq: HealthCheckResult;
  websocket: HealthCheckResult;
  mining: HealthCheckResult;
}

export interface RuntimeRegistrySnapshot {
  nodeVersion: string;
  platform: string;
  pid: number;
  uptimeSeconds: number;
  memoryRssBytes: number;
  memoryHeapUsedBytes: number;
}

export interface EconomySnapshot {
  blockNumber: number;
  activeMiners: number;
  rewardsSettled24h: number;
}

export interface SocketMetricsSnapshot {
  available: boolean;
  reason: string;
  connectionsActive: number | null;
  connectsTotal: number | null;
  disconnectsTotal: number | null;
}

export interface MetricsRegistrySnapshot {
  available: boolean;
  reason: string;
  counters: unknown[];
  gauges: unknown[];
}

export interface AlertRegistrySnapshot {
  available: boolean;
  reason: string;
  alerts: Array<{ id: string; severity: string; message: string; module: string; since: string }>;
}

export interface OpsSnapshot {
  timestamp: string;
  readiness: {
    ok: boolean;
    checks: HealthChecksSnapshot;
  };
  eventLoopLag: EventLoopLagSnapshot;
  runtime: RuntimeRegistrySnapshot;
  economy: EconomySnapshot;
  socket: SocketMetricsSnapshot;
  metrics: MetricsRegistrySnapshot;
  alerts: AlertRegistrySnapshot;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("health_check_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Real event loop lag, sampled synchronously for EVENT_LOOP_SAMPLE_MS via libuv's histogram. */
async function sampleEventLoopLag(): Promise<EventLoopLagSnapshot> {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  await new Promise((resolve) => setTimeout(resolve, EVENT_LOOP_SAMPLE_MS));
  h.disable();
  return {
    maxMs: Number.isFinite(h.max) ? h.max / 1e6 : 0,
    meanMs: Number.isFinite(h.mean) ? h.mean / 1e6 : 0,
    p99Ms: Number.isFinite(h.percentile(99)) ? h.percentile(99) / 1e6 : 0,
    sampleWindowMs: EVENT_LOOP_SAMPLE_MS,
  };
}

/** Real check: SELECT 1 against the live Prisma connection. */
async function checkPostgres(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, HEALTH_CHECK_TIMEOUT_MS);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: unknown) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Placeholder for unmounted infrastructure. */
function notApplicable(reason: string): HealthCheckResult {
  return { ok: true, latencyMs: 0, message: `not_applicable: ${reason}` };
}

async function buildHealthChecks(): Promise<HealthChecksSnapshot> {
  const postgres = await checkPostgres();
  return {
    postgres,
    redis: notApplicable("core/redis/ not ported to current/ yet"),
    bullmq: notApplicable("no BullMQ queue module in current/ yet"),
    websocket: notApplicable("core/socket/ (Socket.IO) not ported to current/ yet"),
    mining: {
      ok: Boolean(miningEngine) && (miningEngine?.blockNumber ?? 0) > 0,
      latencyMs: 0,
      details: {
        blockNumber: miningEngine?.blockNumber ?? 0,
        activeMiners: miningEngine?.miners?.size ?? 0,
      },
    },
  };
}

function buildRuntimeRegistry(): RuntimeRegistrySnapshot {
  const mem = process.memoryUsage();
  return {
    nodeVersion: process.version,
    platform: process.platform,
    pid: process.pid,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryRssBytes: mem.rss,
    memoryHeapUsedBytes: mem.heapUsed,
  };
}

async function buildEconomySnapshot(): Promise<EconomySnapshot> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let rewardsSettled24h = 0;
  try {
    rewardsSettled24h = await prisma.blockMinerReward.count({ where: { createdAt: { gte: dayAgo } } });
  } catch (e: unknown) {
    log.warn("economy snapshot: reward count failed", { error: e instanceof Error ? e.message : String(e) });
  }
  return {
    blockNumber: miningEngine?.blockNumber ?? 0,
    activeMiners: miningEngine?.miners?.size ?? 0,
    rewardsSettled24h,
  };
}

function buildSocketMetricsStub(): SocketMetricsSnapshot {
  return {
    available: false,
    reason: "Socket.IO (core/socket/) is not ported to current/ yet",
    connectionsActive: null,
    connectsTotal: null,
    disconnectsTotal: null,
  };
}

function buildMetricsRegistrySnapshot(): MetricsRegistrySnapshot {
  return {
    available: false,
    reason: "In-process metricsRegistry not ported to current/ yet",
    counters: [],
    gauges: [],
  };
}

function buildAlertRegistrySnapshot(): AlertRegistrySnapshot {
  return {
    available: false,
    reason: "In-process alertRegistry not ported to current/ yet",
    alerts: [],
  };
}

export async function buildOpsSnapshot(): Promise<OpsSnapshot> {
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
