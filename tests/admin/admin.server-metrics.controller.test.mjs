import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";

const controller = await import("../../server/modules/admin/admin.server-metrics.controller.ts");

test("collectServerMetrics returns real numbers sourced from the os module, never placeholders", async () => {
  const m = await controller.collectServerMetrics();

  assert.equal(typeof m.serverCpuUsagePercent, "number");
  assert.ok(m.serverCpuUsagePercent >= 0 && m.serverCpuUsagePercent <= 100);

  assert.equal(m.serverCpuCores, os.cpus().length);
  assert.equal(m.serverMemoryTotalBytes, os.totalmem());
  assert.equal(typeof m.serverMemoryFreeBytes, "number");
  assert.equal(m.serverMemoryUsedBytes, m.serverMemoryTotalBytes - m.serverMemoryFreeBytes);
  assert.ok(m.serverMemoryUsagePercent >= 0 && m.serverMemoryUsagePercent <= 100);

  // Disk usage is best-effort: either real numbers, or an honest null + unavailable flag.
  if (m.serverDiskMetricsAvailable) {
    assert.equal(typeof m.serverDiskTotalBytes, "number");
    assert.equal(typeof m.serverDiskUsedBytes, "number");
    assert.equal(typeof m.serverDiskUsagePercent, "number");
  } else {
    assert.equal(m.serverDiskTotalBytes, null);
    assert.equal(m.serverDiskUsedBytes, null);
    assert.equal(m.serverDiskUsagePercent, null);
  }

  assert.equal(typeof m.uptimeSeconds, "number");
  assert.equal(typeof m.processUptimeSeconds, "number");
  assert.equal(m.platform, process.platform);
  assert.equal(m.nodeVersion, process.version);
  assert.equal(m.processId, process.pid);
});

test("getServerMetrics: express handler responds ok:true with the public metrics shape", async () => {
  let statusCode = 200;
  let payload = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  await controller.getServerMetrics({}, res);

  assert.equal(statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.metrics.cpuUsagePercent, "number");
  assert.equal(typeof payload.metrics.memoryTotalBytes, "number");
  assert.equal(payload.metrics.memoryTotalBytes, os.totalmem());
  assert.equal(typeof payload.metrics.diskUnavailable, "boolean");
  assert.equal(typeof payload.metrics.uptimeSeconds, "number");
  assert.equal(typeof payload.metrics.processUptimeSeconds, "number");
});
