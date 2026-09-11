/**
 * Live server metrics (CPU/RAM/disk) for the admin dashboard. Ported from
 * legacy/server/modules/admin-system/serverMetrics.controller.ts using only
 * Node's native `os` module (no external deps). Numbers are real — never
 * placeholders. Disk usage is best-effort (fs.statfs → `df -kP /` fallback);
 * when unavailable it is reported honestly as null / diskUnavailable: true.
 */
import type { Request, Response } from "express";
import os from "os";
import { promisify } from "util";
import { execFile } from "child_process";
import { logger } from "../../core/logger/index.js";

const log = logger.child("AdminServerMetrics");
const execFileAsync = promisify(execFile);

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Cached: avoids blocking parallel dashboard calls with a repeated CPU sample.
let cachedCpuSample: { at: number; value: number } | null = null;
const CPU_SAMPLE_CACHE_MS = 5_000;

function cpuPercentFromLoadAvg(): number {
  const cores = Math.max(1, os.cpus().length);
  const load1 = Number(os.loadavg()[0] || 0);
  return Math.max(0, Math.min(100, (load1 / cores) * 100));
}

async function measureCpuUsagePercent(): Promise<number> {
  const now = Date.now();
  if (cachedCpuSample && now - cachedCpuSample.at < CPU_SAMPLE_CACHE_MS) {
    return cachedCpuSample.value;
  }
  const value = cpuPercentFromLoadAvg();
  cachedCpuSample = { at: now, value };
  return value;
}

async function readRootDiskUsageBytes(): Promise<{ totalBytes: number; usedBytes: number; diskUsagePercent: number } | null> {
  try {
    const { statfs } = await import("fs/promises");
    if (typeof statfs === "function") {
      const s = await statfs("/");
      const bsize = Number(s.bsize);
      const blocks = Number(s.blocks);
      const bavail = Number(s.bavail);
      if (Number.isFinite(bsize) && bsize > 0 && Number.isFinite(blocks) && blocks > 0) {
        const totalBytes = blocks * bsize;
        const availBytes = Number.isFinite(bavail) ? Math.max(0, bavail) * bsize : 0;
        const usedBytes = Math.max(0, Math.min(totalBytes, totalBytes - availBytes));
        const diskUsagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
        return { totalBytes, usedBytes, diskUsagePercent };
      }
    }
  } catch {
    // fall through to df
  }

  try {
    const { stdout } = await execFileAsync("df", ["-kP", "/"], { timeout: 2000 });
    const lines = stdout.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return null;
    const parts = lines[1]!.trim().split(/\s+/);
    if (parts.length < 3) return null;
    const blocks1k = parseInt(parts[1]!, 10);
    const used1k = parseInt(parts[2]!, 10);
    if (!Number.isFinite(blocks1k) || !Number.isFinite(used1k) || blocks1k <= 0) return null;
    const totalBytes = blocks1k * 1024;
    const usedBytes = Math.max(0, Math.min(totalBytes, used1k * 1024));
    const diskUsagePercent = (usedBytes / totalBytes) * 100;
    return { totalBytes, usedBytes, diskUsagePercent };
  } catch {
    return null;
  }
}

export async function collectServerMetrics() {
  const cpuUsage = await measureCpuUsagePercent();
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;

  const disk = await readRootDiskUsageBytes();

  return {
    serverCpuUsagePercent: cpuUsage,
    serverCpuCores: os.cpus().length,
    serverMemoryTotalBytes: memTotal,
    serverMemoryFreeBytes: memFree,
    serverMemoryUsedBytes: memUsed,
    serverMemoryUsagePercent: memTotal > 0 ? (memUsed / memTotal) * 100 : 0,
    serverDiskTotalBytes: disk?.totalBytes ?? null,
    serverDiskUsedBytes: disk?.usedBytes ?? null,
    serverDiskUsagePercent: disk?.diskUsagePercent ?? null,
    serverDiskMetricsAvailable: Boolean(disk),
    uptimeSeconds: os.uptime(),
    processUptimeSeconds: process.uptime(),
    platform: process.platform,
    nodeVersion: process.version,
    processId: process.pid,
  };
}

export async function getServerMetrics(_req: Request, res: Response): Promise<void> {
  try {
    const m = await collectServerMetrics();
    res.json({
      ok: true,
      metrics: {
        cpuUsagePercent: m.serverCpuUsagePercent,
        cpuCores: m.serverCpuCores,
        memoryTotalBytes: m.serverMemoryTotalBytes,
        memoryFreeBytes: m.serverMemoryFreeBytes,
        memoryUsedBytes: m.serverMemoryUsedBytes,
        memoryUsagePercent: m.serverMemoryUsagePercent,
        diskTotalBytes: m.serverDiskTotalBytes,
        diskUsedBytes: m.serverDiskUsedBytes,
        diskUsagePercent: m.serverDiskUsagePercent,
        diskUnavailable: !m.serverDiskMetricsAvailable,
        uptimeSeconds: m.uptimeSeconds,
        processUptimeSeconds: m.processUptimeSeconds,
        platform: m.platform,
        nodeVersion: m.nodeVersion,
        processId: m.processId,
      },
    });
  } catch (error: unknown) {
    log.error("getServerMetrics failed", { error: errMsg(error) });
    res.status(500).json({ ok: false, message: "Unable to load server metrics." });
  }
}
