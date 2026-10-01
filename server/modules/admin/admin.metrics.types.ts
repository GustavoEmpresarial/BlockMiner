/**
 * Unified server & client metrics and ops types.
 */

export interface AdminServerMetricsSnapshot {
  cpuUsagePercent: number;
  cpuCores: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  memoryUsagePercent: number;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskUsagePercent: number | null;
  diskUnavailable: boolean;
  uptimeSeconds: number;
  processUptimeSeconds?: number;
  platform: string;
  nodeVersion: string;
  processId: number;
}

export type AdminServerMetricsResponse =
  | { ok: true; metrics: AdminServerMetricsSnapshot }
  | { ok: false; message?: string; code?: string };

export interface EventLoopLagSnapshot {
  maxMs: number;
  meanMs: number;
  p99Ms: number;
  sampleWindowMs: number;
}

export interface HealthCheckDetail {
  ok: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface AdminOpsHttpStats {
  requestsTotal: number;
  errors4xxTotal: number;
  errors5xxTotal: number;
  requestsPerMinuteEstimate: number;
}

export interface AdminOpsMiningStats {
  blockNumber: number;
  activeMiners: number;
  engineRunning: boolean;
}

export interface AdminOpsQueueStats {
  bullmqWaiting: number;
  bullmqActive: number;
  bullmqFailed: number;
}

export interface AdminOpsRedisStats {
  connected: number;
}

export interface AdminOpsEconomyRow {
  module: string;
  action: string;
  total: number;
}

export interface AdminOpsAlert {
  id: string;
  severity: string;
  message: string;
  module: string;
  since: string;
}

export interface RuntimeRegistrySnapshot {
  nodeVersion: string;
  platform: string;
  pid: number;
  uptimeSeconds: number;
  memoryRssBytes: number;
  memoryHeapUsedBytes: number;
}

export interface AdminOpsSnapshot {
  timestamp: string;
  readiness: {
    ok: boolean;
    checks: Record<string, HealthCheckDetail>;
  };
  eventLoopLag: EventLoopLagSnapshot;
  runtime: RuntimeRegistrySnapshot;
  http: AdminOpsHttpStats;
  socket: {
    connectionsActive: number;
    connectsTotal: number;
    disconnectsTotal: number;
  };
  mining: AdminOpsMiningStats;
  queues: AdminOpsQueueStats;
  redis: AdminOpsRedisStats;
  economy: AdminOpsEconomyRow[];
  alerts: AdminOpsAlert[];
}

export type AdminOpsSnapshotResponse =
  | { ok: true; snapshot: AdminOpsSnapshot }
  | { ok: false; message?: string; code?: string };
