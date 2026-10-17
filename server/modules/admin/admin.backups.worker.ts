/**
 * Separate process entrypoint for database backups. Spawned by admin.backups.child.ts — never
 * imported by the app.
 *
 * A full backup streams the whole database (~22 GB of plain SQL) through pg_dump → scanner →
 * sha256 → gzip, then counts every table and uploads ~3.5 GB to Google Drive. Inside the app
 * process that held the event loop for over an hour and every request waited behind it. Here it
 * runs on its own event loop at a lower CPU priority, and the app only waits for one IPC message.
 *
 * argv[2]:
 *   "job"    — scheduled job: backup + compression check + Google Drive + retention prune
 *   "backup" — admin "create backup" button: backup + integrity audit only
 *
 * Reply (exactly one IPC message, then exit): { ok: true, result } | { ok: false, error, code }.
 * Logs go to the inherited stdout/stderr, so they land in the app container's logs as before.
 */
import { logger } from "../../core/logger/index.js";

const log = logger.child("BackupWorker");

type WorkerReply = { ok: true; result: unknown } | { ok: false; error: string; code: string };

async function run(mode: string | undefined): Promise<unknown> {
  // Imported lazily so a broken environment (e.g. no DATABASE_URL) becomes a reply, not a crash.
  if (mode === "job") {
    const { runDatabaseBackupJobInProcess } = await import("../../cron/backup.cron.js");
    return runDatabaseBackupJobInProcess();
  }
  if (mode === "backup") {
    const [{ default: prisma }, { createPostgresSqlBackup }] = await Promise.all([
      import("../../core/database/prisma.js"),
      import("./admin.backups.service.js"),
    ]);
    return createPostgresSqlBackup({ prisma, logger: logger.child("AdminBackups") });
  }
  throw Object.assign(new Error(`Unknown backup worker mode: ${String(mode)}`), { code: "BACKUP_WORKER_BAD_MODE" });
}

async function disconnectDatabase(): Promise<void> {
  try {
    const { default: prisma } = await import("../../core/database/prisma.js");
    await prisma.$disconnect();
  } catch {
    /* nothing to close */
  }
}

function reply(message: WorkerReply): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send) {
      // Run by hand (no IPC channel): print the outcome instead.
      console.log(JSON.stringify(message));
      resolve();
      return;
    }
    process.send(message, undefined, {}, (err) => {
      if (err) log.error("backup_worker_reply_failed", { error: err.message });
      resolve();
    });
  });
}

const mode = process.argv[2];
const startedAt = Date.now();
log.info("backup_worker_start", { mode, pid: process.pid });

run(mode)
  .then(async (result) => {
    log.info("backup_worker_done", { mode, durationMs: Date.now() - startedAt });
    await reply({ ok: true, result });
  })
  .catch(async (err: unknown) => {
    const error = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: unknown })?.code;
    log.error("backup_worker_failed", { mode, error, durationMs: Date.now() - startedAt });
    await reply({ ok: false, error, code: typeof code === "string" ? code : "BACKUP_WORKER_FAILED" });
  })
  .finally(async () => {
    await disconnectDatabase();
    process.exit(0);
  });
