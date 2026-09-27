/**
 * Automated Database Backup & Google Drive Sync Cron.
 *
 * Runs scheduled logical PostgreSQL backups (pg_dump plain SQL + manifest .meta.json + bundle),
 * compresses the dump (.sql.gz) for storage efficiency, uploads to Google Drive if authorized,
 * and prunes historical backups according to BACKUP_RETENTION_DAYS.
 *
 * Configurable via .env:
 * - BACKUP_ENABLED (default: true)
 * - BACKUP_CRON (default: "0 3 * * *" -> 03:00 daily)
 * - BACKUP_RUN_ON_STARTUP (default: false, runs once on boot after delay)
 * - BACKUP_STARTUP_DELAY_MS (default: 60000ms = 60s)
 * - BACKUP_RETENTION_DAYS (default: 7)
 * - GOOGLE_DRIVE_BACKUP_ENABLED (default: true)
 */
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { logger } from "../core/logger/index.js";
import prisma from "../core/database/prisma.js";
import {
  createPostgresSqlBackup,
  getAdminBackupsDirectory,
  pruneOldBackups,
} from "../modules/admin/admin.backups.service.js";
import {
  getGoogleDriveStatus,
  uploadBackupPackageToGoogleDrive,
} from "../modules/admin/google-drive.service.js";

const log = logger.child("BackupCron");

let isRunning = false;

export function calculateMsUntilNextRun(cronExpr: string, now: Date = new Date()): number {
  const parts = cronExpr.trim().split(/\s+/);
  const targetMinute = parseInt(parts[0], 10) || 0;
  const targetHour = parseInt(parts[1], 10) || 3;

  const next = new Date(now);
  next.setHours(targetHour, targetMinute, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

async function compressSqlToGzip(sqlPath: string, gzPath: string): Promise<boolean> {
  try {
    const source = createReadStream(sqlPath);
    const destination = createWriteStream(gzPath);
    const gzip = createGzip({ level: 6 });
    await pipeline(source, gzip, destination);
    return true;
  } catch (err: unknown) {
    log.warn("admin_backup_gzip_failed", { error: String(err) });
    return false;
  }
}

export async function runDatabaseBackupJob(): Promise<{
  ok: boolean;
  filename?: string;
  driveUploaded?: boolean;
  driveFileId?: string;
  prunedCount?: number;
  error?: string;
}> {
  if (isRunning) {
    log.warn("admin_backup_job_skipped", { reason: "backup already in progress" });
    return { ok: false, error: "Backup already in progress" };
  }

  isRunning = true;
  const startedAt = Date.now();
  log.info("admin_backup_job_start", { timestamp: new Date().toISOString() });

  try {
    // 1. Create logical PostgreSQL dump via pg_dump + bundle
    const backup = await createPostgresSqlBackup({ prisma, logger: log });
    const backupsDir = getAdminBackupsDirectory();
    const sqlPath = path.join(backupsDir, backup.name);
    const gzPath = path.join(backupsDir, `${backup.name}.gz`);

    // 2. Compress .sql to .sql.gz
    const compressed = await compressSqlToGzip(sqlPath, gzPath);
    log.info("admin_backup_compression_done", {
      filename: backup.name,
      compressed,
    });
    if (compressed) {
      try {
        await fs.unlink(sqlPath);
        log.info("admin_backup_uncompressed_reclaimed", { filename: backup.name });
      } catch {
        /* ignore */
      }
    }

    // 3. Sync to Google Drive if authorized
    let driveUploaded = false;
    let driveFileId: string | undefined = undefined;

    const gdriveEnabled =
      process.env.GOOGLE_DRIVE_BACKUP_ENABLED !== "0" &&
      process.env.GOOGLE_DRIVE_BACKUP_ENABLED !== "false";

    if (gdriveEnabled) {
      try {
        const driveStatus = await getGoogleDriveStatus();
        if (driveStatus.isConnected) {
          log.info("admin_backup_gdrive_upload_start", { filename: backup.name });
          const uploadResult = await uploadBackupPackageToGoogleDrive(backup.name);
          driveUploaded = true;
          driveFileId = uploadResult.sqlUpload.fileId;
          log.info("admin_backup_gdrive_upload_success", {
            filename: backup.name,
            fileId: driveFileId,
            driveFolder: driveStatus.folderName,
          });
        } else {
          log.warn("admin_backup_gdrive_not_authorized", {
            message: "Google Drive is not authorized. Backup saved locally only.",
          });
        }
      } catch (uploadErr: unknown) {
        log.error("admin_backup_gdrive_upload_failed", {
          filename: backup.name,
          error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
        });
      }
    }

    // 4. Prune old backups per retention policy
    const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 7);
    const prunedCount = await pruneOldBackups(retentionDays);

    const durationMs = Date.now() - startedAt;
    log.info("admin_backup_job_success", {
      filename: backup.name,
      sizeBytes: backup.size,
      durationMs,
      driveUploaded,
      prunedCount,
    });

    return {
      ok: true,
      filename: backup.name,
      driveUploaded,
      driveFileId,
      prunedCount,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("admin_backup_job_failed", { error: errorMsg });
    return { ok: false, error: errorMsg };
  } finally {
    isRunning = false;
  }
}

export function startBackupCron(): { stop: () => void } {
  const isEnabled =
    process.env.BACKUP_ENABLED !== "false" &&
    process.env.BACKUP_ENABLED !== "0";

  if (!isEnabled) {
    log.info("Backup cron is disabled via BACKUP_ENABLED");
    return { stop: () => {} };
  }

  const cronExpr = String(process.env.BACKUP_CRON || "0 3 * * *");
  const runOnStartup =
    process.env.BACKUP_RUN_ON_STARTUP === "true" ||
    process.env.BACKUP_RUN_ON_STARTUP === "1";
  const startupDelayMs = Number(process.env.BACKUP_STARTUP_DELAY_MS || 60_000);

  let startupTimer: NodeJS.Timeout | null = null;
  let scheduleTimer: NodeJS.Timeout | null = null;
  let stopped = false;

  function scheduleNext() {
    if (stopped) return;
    const msUntilNext = calculateMsUntilNextRun(cronExpr);
    log.info("admin_backup_next_scheduled", {
      cron: cronExpr,
      nextInHours: (msUntilNext / 3_600_000).toFixed(2),
    });

    scheduleTimer = setTimeout(async () => {
      try {
        await runDatabaseBackupJob();
      } catch (err: unknown) {
        log.error("admin_backup_scheduled_run_error", { error: String(err) });
      } finally {
        scheduleNext();
      }
    }, msUntilNext);

    scheduleTimer.unref?.();
  }

  if (runOnStartup) {
    startupTimer = setTimeout(() => {
      log.info("admin_backup_startup_run_triggered");
      void runDatabaseBackupJob();
    }, startupDelayMs);
    startupTimer.unref?.();
  }

  scheduleNext();

  return {
    stop: () => {
      stopped = true;
      if (startupTimer) clearTimeout(startupTimer);
      if (scheduleTimer) clearTimeout(scheduleTimer);
      log.info("Backup cron stopped");
    },
  };
}
