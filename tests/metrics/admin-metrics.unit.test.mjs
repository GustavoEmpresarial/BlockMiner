import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

const { collectServerMetrics, getServerMetrics } = await import(
  "../../server/modules/admin/admin.server-metrics.controller.ts"
);
const { formatBytes, formatUptime } = await import(
  "../../client/src/features/admin/lib/admin.format.ts"
);

test("Unit: collectServerMetrics returns valid host and process metrics", async () => {
  const m = await collectServerMetrics();

  assert.equal(typeof m.serverCpuUsagePercent, "number");
  assert.ok(m.serverCpuUsagePercent >= 0 && m.serverCpuUsagePercent <= 100);

  assert.equal(m.serverCpuCores, os.cpus().length);
  assert.equal(m.serverMemoryTotalBytes, os.totalmem());
  assert.equal(typeof m.serverMemoryFreeBytes, "number");
  assert.ok(m.serverMemoryFreeBytes >= 0 && m.serverMemoryFreeBytes <= m.serverMemoryTotalBytes);
  assert.equal(m.serverMemoryUsedBytes, m.serverMemoryTotalBytes - m.serverMemoryFreeBytes);
  assert.ok(m.serverMemoryUsagePercent >= 0 && m.serverMemoryUsagePercent <= 100);

  if (m.serverDiskMetricsAvailable) {
    assert.equal(typeof m.serverDiskTotalBytes, "number");
    assert.equal(typeof m.serverDiskUsedBytes, "number");
    assert.equal(typeof m.serverDiskUsagePercent, "number");
    assert.ok(m.serverDiskTotalBytes > 0);
  } else {
    assert.equal(m.serverDiskTotalBytes, null);
    assert.equal(m.serverDiskUsedBytes, null);
    assert.equal(m.serverDiskUsagePercent, null);
  }

  assert.equal(typeof m.uptimeSeconds, "number");
  assert.ok(m.uptimeSeconds > 0);
  assert.equal(typeof m.processUptimeSeconds, "number");
  assert.ok(m.processUptimeSeconds >= 0);
  assert.equal(m.platform, process.platform);
  assert.equal(m.nodeVersion, process.version);
  assert.equal(m.processId, process.pid);
});

test("Unit: collectServerMetrics caches CPU sample within 5-second window", async () => {
  const sample1 = await collectServerMetrics();
  const sample2 = await collectServerMetrics();

  // Within the cache window, the CPU measurement returns the identical cached value
  assert.equal(sample1.serverCpuUsagePercent, sample2.serverCpuUsagePercent);
});

test("Unit: getServerMetrics Express handler returns status 200 and formatted metrics", async () => {
  let statusCode = 200;
  let sentData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      sentData = data;
      return this;
    },
  };

  await getServerMetrics({}, res);

  assert.equal(statusCode, 200);
  assert.equal(sentData.ok, true);
  assert.equal(typeof sentData.metrics.cpuUsagePercent, "number");
  assert.equal(sentData.metrics.cpuCores, os.cpus().length);
  assert.equal(sentData.metrics.memoryTotalBytes, os.totalmem());
  assert.equal(typeof sentData.metrics.diskUnavailable, "boolean");
});

test("Unit: formatBytes formats boundary numbers, nulls and large sizes properly", () => {
  assert.equal(formatBytes(null), "—");
  assert.equal(formatBytes(undefined), "—");
  assert.equal(formatBytes("invalid"), "—");
  assert.equal(formatBytes(-100), "—");
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(1000), "1 KB");
  assert.equal(formatBytes(1500000), "1.5 MB");
  assert.equal(formatBytes(2000000000), "2 GB");
  assert.equal(formatBytes(5000000000000), "5 TB");
});

test("Unit: formatUptime formats seconds into human readable duration", () => {
  assert.equal(formatUptime(-1), "0d 0h 0m");
  assert.equal(formatUptime(NaN), "0d 0h 0m");
  assert.equal(formatUptime(0), "0d 0h 0m");
  assert.equal(formatUptime(59), "0d 0h 0m");
  assert.equal(formatUptime(60), "0d 0h 1m");
  assert.equal(formatUptime(3660), "0d 1h 1m");
  assert.equal(formatUptime(90060), "1d 1h 1m");
});
