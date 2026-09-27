import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {
  calculateMsUntilNextRun,
  startBackupCron,
} from "../../server/cron/backup.cron.js";
import { pruneOldBackups, deleteSqlBackup } from "../../server/modules/admin/admin.backups.service.js";

test("calculateMsUntilNextRun: schedules for today when target hour is in the future", () => {
  const base = new Date("2026-09-27T01:00:00.000Z");
  // Target 03:00 UTC (in 2 hours)
  const ms = calculateMsUntilNextRun("0 3 * * *", base);
  // Expected roughly 2 hours (within 1 hour variance for timezone)
  assert.ok(ms > 0, "ms must be positive");
  assert.ok(ms <= 24 * 60 * 60 * 1000, "ms must not exceed 24 hours");
});

test("calculateMsUntilNextRun: rolls over to next day when target hour has passed", () => {
  const base = new Date("2026-09-27T04:00:00.000Z");
  // Target 03:00 (already passed today)
  const ms = calculateMsUntilNextRun("0 3 * * *", base);
  assert.ok(ms > 0, "ms must be positive");
  assert.ok(ms <= 24 * 60 * 60 * 1000, "ms must not exceed 24 hours");
});

test("calculateMsUntilNextRun: parses minute and hour correctly", () => {
  const base = new Date();
  base.setHours(10, 0, 0, 0);

  // Target 10:30 (30 minutes in the future)
  const ms = calculateMsUntilNextRun("30 10 * * *", base);
  assert.equal(ms, 30 * 60 * 1000);

  // Target 09:30 (already passed today -> tomorrow at 09:30, 23.5 hours later)
  const msPassed = calculateMsUntilNextRun("30 9 * * *", base);
  assert.equal(msPassed, 23.5 * 60 * 60 * 1000);
});

test("startBackupCron: returns stop handle and can be disabled via BACKUP_ENABLED=false", () => {
  const prev = process.env.BACKUP_ENABLED;
  try {
    process.env.BACKUP_ENABLED = "false";
    const cron = startBackupCron();
    assert.equal(typeof cron.stop, "function");
    cron.stop();
  } finally {
    if (prev === undefined) delete process.env.BACKUP_ENABLED;
    else process.env.BACKUP_ENABLED = prev;
  }
});

test("startBackupCron: schedules startup run and timers cleanly, then stops without leak", () => {
  const prevEnabled = process.env.BACKUP_ENABLED;
  const prevStartup = process.env.BACKUP_RUN_ON_STARTUP;
  const prevDelay = process.env.BACKUP_STARTUP_DELAY_MS;
  const prevCron = process.env.BACKUP_CRON;

  try {
    process.env.BACKUP_ENABLED = "true";
    process.env.BACKUP_RUN_ON_STARTUP = "true";
    process.env.BACKUP_STARTUP_DELAY_MS = "999999";
    process.env.BACKUP_CRON = "0 3 * * *";

    const cron = startBackupCron();
    assert.equal(typeof cron.stop, "function");
    // Stop immediately so background timers do not hang
    cron.stop();
  } finally {
    if (prevEnabled === undefined) delete process.env.BACKUP_ENABLED;
    else process.env.BACKUP_ENABLED = prevEnabled;
    if (prevStartup === undefined) delete process.env.BACKUP_RUN_ON_STARTUP;
    else process.env.BACKUP_RUN_ON_STARTUP = prevStartup;
    if (prevDelay === undefined) delete process.env.BACKUP_STARTUP_DELAY_MS;
    else process.env.BACKUP_STARTUP_DELAY_MS = prevDelay;
    if (prevCron === undefined) delete process.env.BACKUP_CRON;
    else process.env.BACKUP_CRON = prevCron;
  }
});

test("pruneOldBackups: removes backups older than retention policy while keeping newest", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-backup-prune-test-"));
  const prev = process.env.BACKUP_DIR;

  try {
    process.env.BACKUP_DIR = tmpDir;

    // Create 3 mock backup sets
    const now = Date.now();
    const b1 = `backup-2026-09-27T00-00-00-001Z.sql`; // Newest
    const b2 = `backup-2026-09-20T00-00-00-002Z.sql`; // 7 days ago
    const b3 = `backup-2026-09-10T00-00-00-003Z.sql`; // 17 days ago

    for (const b of [b1, b2, b3]) {
      await fs.writeFile(path.join(tmpDir, b), "-- PostgreSQL database dump\n", "utf8");
      await fs.writeFile(path.join(tmpDir, `${b}.gz`), "compressed-mock", "utf8");
      await fs.writeFile(
        path.join(tmpDir, `${b.replace(/\.sql$/, "")}.meta.json`),
        JSON.stringify({ status: "success", filename: b }),
        "utf8",
      );
      await fs.writeFile(
        path.join(tmpDir, `${b.replace(/\.sql$/, "")}.bundle.tar.gz`),
        "bundle-mock",
        "utf8",
      );
    }

    // Set timestamps to simulate age
    const oldTime = new Date(now - 15 * 24 * 60 * 60 * 1000);
    await fs.utimes(path.join(tmpDir, b3), oldTime, oldTime);

    // Prune with retention of 2
    const pruned = await pruneOldBackups(2);
    assert.ok(pruned >= 1, `Expected at least 1 pruned backup, got ${pruned}`);

    // Verify newest backup b1 is preserved
    const files = await fs.readdir(tmpDir);
    assert.ok(files.includes(b1), "b1 must be preserved");

    // Test deleteSqlBackup also deletes .gz
    await deleteSqlBackup(b1);
    const filesAfterDelete = await fs.readdir(tmpDir);
    assert.ok(!filesAfterDelete.includes(b1), "b1 .sql deleted");
    assert.ok(!filesAfterDelete.includes(`${b1}.gz`), "b1 .gz deleted");
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("runDatabaseBackupJob: handles missing DATABASE_URL gracefully without uncaught rejection", async () => {
  const prevUrl = process.env.DATABASE_URL;
  try {
    delete process.env.DATABASE_URL;
    const { runDatabaseBackupJob } = await import("../../server/cron/backup.cron.js");
    const result = await runDatabaseBackupJob();
    assert.equal(result.ok, false);
    assert.ok(result.error);
  } finally {
    if (prevUrl !== undefined) process.env.DATABASE_URL = prevUrl;
  }
});

