/**
 * Integration: database backups run in a separate process (admin.backups.worker.ts).
 * A fake pg_dump (PG_DUMP_PATH) streams a synthetic ~200 MB plain dump so the real pipeline
 * (fork → scanner → sha256 → gzip → file) runs end to end without a real database dump.
 * Needs the local DATABASE_URL (table list); skips the row-count audit to stay fast.
 */
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";

const { runBackupInChildProcess, backupWorkerStatus, BackupWorkerError } = await import(
  "../../server/modules/admin/admin.backups.child.ts"
);

const DUMP_MB = 200;
let tmpDir;
const saved = {};

function setEnv(k, v) {
  if (!(k in saved)) saved[k] = process.env[k];
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-backup-child-"));
  const fake = path.join(tmpDir, "fake-pg_dump.sh");
  const tables = "users transactions user_vault user_owned_machines miners internal_offerwall_offers";
  await fs.writeFile(
    fake,
    `#!/bin/sh
printf -- '--\\n-- PostgreSQL database dump\\n--\\n\\n'
for t in ${tables}; do printf 'COPY public.%s (id) FROM stdin;\\n1\\n\\\\.\\n\\n' "$t"; done
printf 'COPY public.big_table (id, body) FROM stdin;\\n'
yes '123456	some row body text 0.12345678	2026-10-16 00:00:00+00' | head -c ${DUMP_MB * 1024 * 1024}
printf '\\n\\\\.\\n\\n--\\n-- PostgreSQL database dump complete\\n--\\n'
`,
    { mode: 0o755 },
  );
  setEnv("PG_DUMP_PATH", fake);
  setEnv("BACKUP_DIR", path.join(tmpDir, "backups"));
  setEnv("BACKUP_SKIP_ROW_COUNT_AUDIT", "1");
});

test.after(async () => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Max event-loop delay (ms) seen while `fn` runs, sampled every 10 ms. */
async function maxLoopLag(fn) {
  let max = 0;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    max = Math.max(max, now - last - 10);
    last = now;
  }, 10);
  try {
    const value = await fn();
    return { value, max };
  } finally {
    clearInterval(timer);
  }
}

async function sha256OfGunzip(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(createReadStream(file), createGunzip(), async function* (src) {
    for await (const chunk of src) hash.update(chunk);
  });
  return hash.digest("hex");
}

test("backup runs in a child process, produces a valid .gz and leaves the parent loop free", { timeout: 300_000 }, async () => {
  const { value: backup, max } = await maxLoopLag(() => runBackupInChildProcess("backup"));
  console.log(`# child: ${DUMP_MB} MB dump, parent max event-loop lag ${max.toFixed(1)} ms, backup ${backup.durationMs} ms`);

  assert.equal(backup.status, "success");
  assert.ok(backup.size > DUMP_MB * 1024 * 1024, "plain size counted");
  assert.equal(backup.criticalTablesPresent.length, 6);
  const gz = path.join(process.env.BACKUP_DIR, `${backup.name}.gz`);
  assert.equal(await sha256OfGunzip(gz), backup.sha256, "sha256 recorded by the child matches the file");
  assert.equal(backupWorkerStatus(), null, "guard released");
  assert.ok(max < 250, `parent event loop stayed responsive (max lag ${max.toFixed(1)} ms)`);
});

test("only one backup at a time; the second caller gets BACKUP_ALREADY_RUNNING", { timeout: 300_000 }, async () => {
  const first = runBackupInChildProcess("backup");
  await assert.rejects(runBackupInChildProcess("job"), (e) => e instanceof BackupWorkerError && e.code === "BACKUP_ALREADY_RUNNING");
  assert.equal(backupWorkerStatus().mode, "backup");
  await first;
  assert.equal(backupWorkerStatus(), null);
});

test("a failing backup comes back as an error with a code, not a crash of the parent", { timeout: 120_000 }, async () => {
  setEnv("PG_DUMP_PATH", path.join(tmpDir, "does-not-exist"));
  try {
    await assert.rejects(runBackupInChildProcess("backup"), (e) => e instanceof BackupWorkerError && e.code === "BACKUP_WORKER_FAILED" && /pg_dump/.test(e.message));
  } finally {
    setEnv("PG_DUMP_PATH", path.join(tmpDir, "fake-pg_dump.sh"));
  }
  assert.equal(backupWorkerStatus(), null);
});

test("a killed worker is reported as BACKUP_WORKER_CRASHED and releases the guard", { timeout: 120_000 }, async () => {
  const p = runBackupInChildProcess("backup");
  const pid = backupWorkerStatus().pid;
  assert.ok(pid);
  process.kill(pid, "SIGKILL");
  await assert.rejects(p, (e) => e instanceof BackupWorkerError && e.code === "BACKUP_WORKER_CRASHED");
  assert.equal(backupWorkerStatus(), null);
});

test("the worker runs at a lower CPU priority than the app", { timeout: 120_000 }, async () => {
  const p = runBackupInChildProcess("backup");
  const pid = backupWorkerStatus().pid;
  await new Promise((r) => setTimeout(r, 200));
  let prio = null;
  try {
    prio = os.getPriority(pid);
  } catch {
    /* already exited */
  }
  await p;
  if (prio !== null) assert.ok(prio > os.getPriority(), `child nice ${prio} > parent ${os.getPriority()}`);
});
