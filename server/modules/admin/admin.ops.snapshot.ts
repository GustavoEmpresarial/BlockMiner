/**
 * Real GET /api/admin/ops/snapshot payload.
 */
import { monitorEventLoopDelay } from "node:perf_hooks";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { miningEngine } from "../mining/index.js";
import type {
  AdminOpsSnapshot,
  AdminOpsEconomyRow,
  EventLoopLagSnapshot,
  HealthCheckDetail,
  RuntimeRegistrySnapshot,
} from "./admin.metrics.types.js";

const log = logger.child("AdminOpsSnapshot");

const HEALTH_CHECK_TIMEOUT_MS = 2000;
const EVENT_LOOP_SAMPLE_MS = 200;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const HOURS_PER_DAY = 24;
const NS_PER_MS = 1e6;
const DAY_IN_MS = HOURS_PER_DAY * SECONDS_PER_MINUTE * SECONDS_PER_MINUTE * MS_PER_SECOND;

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
    maxMs: Number.isFinite(h.max) ? h.max / NS_PER_MS : 0,
    meanMs: Number.isFinite(h.mean) ? h.mean / NS_PER_MS : 0,
    p99Ms: Number.isFinite(h.percentile(99)) ? h.percentile(99) / NS_PER_MS : 0,
    sampleWindowMs: EVENT_LOOP_SAMPLE_MS,
  };
}

/** Real check: SELECT 1 against the live Prisma connection. */
async function checkPostgres(): Promise<HealthCheckDetail> {
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
function notApplicable(reason: string): HealthCheckDetail {
  return { ok: true, latencyMs: 0, message: `not_applicable: ${reason}` };
}

async function buildHealthChecks(): Promise<Record<string, HealthCheckDetail>> {
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

async function buildEconomyRows(): Promise<AdminOpsEconomyRow[]> {
  const dayAgo = new Date(Date.now() - DAY_IN_MS);
  let rewardsSettled24h = 0;
  try {
    rewardsSettled24h = await prisma.blockMinerReward.count({ where: { createdAt: { gte: dayAgo } } });
  } catch (e: unknown) {
    log.warn("economy snapshot: reward count failed", { error: e instanceof Error ? e.message : String(e) });
  }
  const activeMiners = miningEngine?.miners?.size ?? 0;
  const blockNumber = miningEngine?.blockNumber ?? 0;

  return [
    { module: "mining", action: "rewards_settled_24h", total: rewardsSettled24h },
    { module: "mining", action: "active_miners", total: activeMiners },
    { module: "mining", action: "current_block", total: blockNumber },
  ];
}

export async function buildOpsSnapshot(): Promise<AdminOpsSnapshot> {
  const [eventLoopLag, checks, economy] = await Promise.all([
    sampleEventLoopLag(),
    buildHealthChecks(),
    buildEconomyRows(),
  ]);
  const postgresOk = checks["postgres"]?.ok ?? false;
  const miningOk = checks["mining"]?.ok ?? false;
  const requiredOk = postgresOk && miningOk;

  return {
    timestamp: new Date().toISOString(),
    readiness: {
      ok: requiredOk,
      checks,
    },
    eventLoopLag,
    runtime: buildRuntimeRegistry(),
    http: {
      requestsTotal: 0,
      errors4xxTotal: 0,
      errors5xxTotal: 0,
      requestsPerMinuteEstimate: 0,
    },
    socket: {
      connectionsActive: 0,
      connectsTotal: 0,
      disconnectsTotal: 0,
    },
    mining: {
      blockNumber: miningEngine?.blockNumber ?? 0,
      activeMiners: miningEngine?.miners?.size ?? 0,
      engineRunning: Boolean(miningEngine),
    },
    queues: {
      bullmqWaiting: 0,
      bullmqActive: 0,
      bullmqFailed: 0,
    },
    redis: {
      connected: 0,
    },
    economy,
    alerts: [],
  };
}
