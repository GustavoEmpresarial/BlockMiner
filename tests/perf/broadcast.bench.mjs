import test from "node:test";
import assert from "node:assert/strict";
import * as broadcastService from "../../server/modules/notifications/broadcast.service.js";
import prisma from "../../server/core/database/prisma.js";

test("Broadcast Performance & Load Benchmark", async (t) => {
  let broadcastId = null;
  const userIds = [];
  const CONCURRENT_USERS = 100;

  t.before(async () => {
    // Create an active broadcast
    await broadcastService.deactivateAllBroadcastMessages();
    const created = await broadcastService.createBroadcastMessage({
      title: "Performance Benchmark Broadcast",
      content: "Benchmarking active query and dismiss upserts under high concurrency",
      isActive: true,
      dismissDelaySeconds: 5,
    });
    broadcastId = created.id;

    // Create 100 test users in a transaction
    const usersData = Array.from({ length: CONCURRENT_USERS }, (_, i) => ({
      name: `Bench User ${i}`,
      username: `bench_user_${Date.now()}_${i}`,
      email: `bench_user_${Date.now()}_${i}@blockminer.test`,
      passwordHash: "bench_hash",
      walletAddress: `0xbench_${Date.now()}_${i}`.slice(0, 42),
    }));

    for (const u of usersData) {
      const createdUser = await prisma.user.create({ data: u });
      userIds.push(createdUser.id);
    }
  });

  t.after(async () => {
    if (broadcastId) {
      await prisma.broadcastMessageView.deleteMany({ where: { messageId: broadcastId } }).catch(() => {});
      await prisma.broadcastMessage.delete({ where: { id: broadcastId } }).catch(() => {});
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    }
  });

  await t.test("Benchmark 1: Concurrent getActiveBroadcastForUser throughput & latency", async () => {
    const latencies = [];
    const startTime = performance.now();

    // Fire CONCURRENT_USERS requests in parallel
    const promises = userIds.map(async (uid) => {
      const t0 = performance.now();
      const active = await broadcastService.getActiveBroadcastForUser(uid);
      const t1 = performance.now();
      latencies.push(t1 - t0);
      return active;
    });

    const results = await Promise.all(promises);
    const totalDuration = performance.now() - startTime;

    // Verify all got the active broadcast
    assert.equal(results.length, CONCURRENT_USERS);
    results.forEach((r) => assert.equal(r?.id, broadcastId));

    // Calculate latency metrics
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)].toFixed(2);
    const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(2);
    const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(2);
    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
    const opsPerSec = ((CONCURRENT_USERS / totalDuration) * 1000).toFixed(0);

    console.log(`\n  ⚡ [Benchmark 1] Active Broadcast Query (${CONCURRENT_USERS} concurrent calls):`);
    console.log(`     Total Duration: ${totalDuration.toFixed(2)} ms`);
    console.log(`     Throughput:     ${opsPerSec} ops/sec`);
    console.log(`     Latency:        Avg: ${avg}ms | P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms`);

    // Assert reasonable performance bounds (P95 < 200ms)
    assert.ok(Number(p95) < 500, `P95 latency should be < 500ms, got ${p95}ms`);
  });

  await t.test("Benchmark 2: Concurrent dismissBroadcastForUser upsert throughput & latency", async () => {
    const latencies = [];
    const startTime = performance.now();

    // Fire CONCURRENT_USERS dismiss upserts concurrently
    const promises = userIds.map(async (uid) => {
      const t0 = performance.now();
      await broadcastService.dismissBroadcastForUser(uid, broadcastId);
      const t1 = performance.now();
      latencies.push(t1 - t0);
    });

    await Promise.all(promises);
    const totalDuration = performance.now() - startTime;

    // Verify all views were recorded
    const found = await broadcastService.findBroadcastMessageById(broadcastId);
    assert.equal(found._count.views, CONCURRENT_USERS);

    // Calculate latency metrics
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)].toFixed(2);
    const p95 = latencies[Math.floor(latencies.length * 0.95)].toFixed(2);
    const p99 = latencies[Math.floor(latencies.length * 0.99)].toFixed(2);
    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
    const opsPerSec = ((CONCURRENT_USERS / totalDuration) * 1000).toFixed(0);

    console.log(`\n  ⚡ [Benchmark 2] Dismiss Upsert Under Load (${CONCURRENT_USERS} concurrent calls):`);
    console.log(`     Total Duration: ${totalDuration.toFixed(2)} ms`);
    console.log(`     Throughput:     ${opsPerSec} ops/sec`);
    console.log(`     Latency:        Avg: ${avg}ms | P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms\n`);

    assert.ok(Number(p95) < 500, `P95 latency should be < 500ms, got ${p95}ms`);
  });
});
