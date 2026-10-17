/**
 * Runs a database backup in a separate Node process (admin.backups.worker.ts) so the dump,
 * hashing, gzip, row-count audit and Google Drive upload never touch the app's event loop.
 *
 * One backup at a time per app process: the scheduled job and the admin button share the guard.
 * The child runs at a lower CPU priority (BACKUP_WORKER_NICE, default 10) and is killed after
 * BACKUP_WORKER_TIMEOUT_MS (default 6 h).
 */
import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { logger } from "../../core/logger/index.js";

const log = logger.child("BackupChild");

export type BackupWorkerMode = "job" | "backup";

export class BackupWorkerError extends Error {
  constructor(
    readonly code:
      | "BACKUP_ALREADY_RUNNING"
      | "BACKUP_WORKER_FAILED"
      | "BACKUP_WORKER_CRASHED"
      | "BACKUP_WORKER_TIMEOUT"
      | "BACKUP_WORKER_SPAWN_FAILED"
      | string,
    message: string,
  ) {
    super(message);
    this.name = "BackupWorkerError";
  }
}

let running: { mode: BackupWorkerMode; pid?: number; startedAt: number } | null = null;

export function backupWorkerStatus() {
  return running ? { ...running } : null;
}

/** Compiled build runs the .js; tests/dev under tsx only have the .ts. */
export function resolveBackupWorkerEntry(): { file: string; execArgv: string[] } {
  const js = fileURLToPath(new URL("./admin.backups.worker.js", import.meta.url));
  if (existsSync(js)) return { file: js, execArgv: [] };
  return { file: fileURLToPath(new URL("./admin.backups.worker.ts", import.meta.url)), execArgv: ["--import", "tsx"] };
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(process.env[name] ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  try {
    if (child.pid) process.kill(-child.pid, signal);
  } catch {
    child.kill(signal); // group already gone or not a group leader
  }
}

export function runBackupInChildProcess<T>(mode: BackupWorkerMode): Promise<T> {
  if (running) {
    return Promise.reject(
      new BackupWorkerError("BACKUP_ALREADY_RUNNING", `Backup already in progress (${running.mode}, pid ${running.pid ?? "?"})`),
    );
  }
  const timeoutMs = envInt("BACKUP_WORKER_TIMEOUT_MS", 6 * 3_600_000, 1_000, 24 * 3_600_000);
  const nice = envInt("BACKUP_WORKER_NICE", 10, 0, 19);
  const { file, execArgv } = resolveBackupWorkerEntry();
  const startedAt = Date.now();
  running = { mode, startedAt };

  return new Promise<T>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = fork(file, [mode], {
        execArgv,
        env: process.env,
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        serialization: "advanced",
        // Own process group, so a timeout also takes down pg_dump/tar spawned by the worker.
        detached: true,
      });
    } catch (err: unknown) {
      running = null;
      reject(new BackupWorkerError("BACKUP_WORKER_SPAWN_FAILED", err instanceof Error ? err.message : String(err)));
      return;
    }
    running = { mode, startedAt, pid: child.pid };
    if (child.pid) {
      try {
        os.setPriority(child.pid, nice);
      } catch (err: unknown) {
        log.warn("backup_worker_nice_failed", { pid: child.pid, error: err instanceof Error ? err.message : String(err) });
      }
    }
    log.info("backup_worker_spawned", { mode, pid: child.pid, nice, timeoutMs });

    let reply: { ok: boolean; result?: unknown; error?: string; code?: string } | null = null;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running = null;
      fn();
    };

    const timer = setTimeout(() => {
      log.error("backup_worker_timeout", { mode, pid: child.pid, timeoutMs });
      killGroup(child, "SIGTERM");
      setTimeout(() => killGroup(child, "SIGKILL"), 30_000).unref();
      finish(() => reject(new BackupWorkerError("BACKUP_WORKER_TIMEOUT", `Backup worker exceeded ${timeoutMs} ms`)));
    }, timeoutMs);
    timer.unref();

    child.on("message", (msg) => {
      if (msg && typeof msg === "object" && "ok" in msg) reply = msg as typeof reply;
    });
    child.on("error", (err) => {
      finish(() => reject(new BackupWorkerError("BACKUP_WORKER_SPAWN_FAILED", err.message)));
    });
    child.on("exit", (code, signal) => {
      const durationMs = Date.now() - startedAt;
      if (reply?.ok) {
        log.info("backup_worker_exited", { mode, pid: child.pid, durationMs });
        finish(() => resolve(reply!.result as T));
        return;
      }
      if (reply) {
        finish(() => reject(new BackupWorkerError(reply!.code || "BACKUP_WORKER_FAILED", reply!.error || "Backup failed")));
        return;
      }
      log.error("backup_worker_crashed", { mode, pid: child.pid, code, signal, durationMs });
      finish(() =>
        reject(new BackupWorkerError("BACKUP_WORKER_CRASHED", `Backup worker exited without a result (code ${code}, signal ${signal})`)),
      );
    });
  });
}
