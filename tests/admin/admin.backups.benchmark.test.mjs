import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const svc = await import("../../server/modules/admin/admin.backups.service.ts");

test("Performance Benchmark: High-throughput integrity verification of multiple dumps", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-perf-benchmark-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;

    // Create 10 mock backups of ~50KB each
    const filenames = [];
    for (let i = 0; i < 10; i++) {
      const filename = `backup-2026-09-21T14-0${i}-00-000Z.sql`;
      filenames.push(filename);
      let content = "-- PostgreSQL database dump\n";
      for (const t of svc.CRITICAL_PUBLIC_TABLES) {
        content += `COPY public.${t} (id) FROM stdin;\n`;
        for (let j = 0; j < 50; j++) {
          content += `${j}\n`;
        }
        content += "\\.\n\n";
      }
      content += "-- PostgreSQL database dump complete\n";
      const filePath = path.join(tmpDir, filename);
      await fs.writeFile(filePath, content, "utf8");

      const sha = await svc.computeFileSha256(filePath);
      await fs.writeFile(
        path.join(tmpDir, filename.replace(/\.sql$/, ".meta.json")),
        JSON.stringify({
          version: 1,
          filename,
          createdAt: new Date().toISOString(),
          status: "success",
          sha256: sha,
        }),
        "utf8"
      );
    }

    const startTime = Date.now();
    // Run verification concurrently
    const results = await Promise.all(filenames.map((f) => svc.verifyBackupIntegrity(f)));
    const totalDurationMs = Date.now() - startTime;

    assert.equal(results.length, 10);
    for (const res of results) {
      assert.equal(res.ok, true);
      assert.equal(res.status, "valid");
    }

    // Must verify 10 dumps in under 1.5 seconds (< 150ms per dump)
    assert.ok(totalDurationMs < 1500, `Expected total verification under 1500ms, took: ${totalDurationMs}ms`);
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
