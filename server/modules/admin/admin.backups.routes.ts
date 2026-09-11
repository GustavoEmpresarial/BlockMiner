/**
 * Admin backups routes — full PostgreSQL logical dumps via pg_dump (see
 * admin.backups.service.ts). Ported from
 * legacy/server/modules/admin-system/backups.admin.routes.ts.
 * Mounted at /backups inside adminRouter → inherits requireAdminAuth +
 * adminLimiter. Full paths /api/admin/backups* unchanged.
 */
import express from "express";
import prisma from "../../core/database/prisma.js";
import {
  createPostgresSqlBackup,
  listSqlBackups,
  deleteSqlBackup,
  resolveBackupDownloadPath,
  resolveBackupBundleDownloadPath,
} from "./admin.backups.service.js";
import { logger } from "../../core/logger/index.js";

export const backupsAdminRouter = express.Router();

const log = logger.child("AdminBackup");
function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

backupsAdminRouter.get("/", async (_req, res) => {
  try {
    const { backups } = await listSqlBackups();
    res.json({ ok: true, backups });
  } catch (error) {
    log.error("admin_backup_list_failed", { message: errMsg(error) });
    res.status(500).json({ ok: false, message: "Unable to list backups." });
  }
});

backupsAdminRouter.get("/download", async (req, res) => {
  try {
    const { file } = req.query;
    if (!file) {
      res.status(400).send("File name required");
      return;
    }
    const filePath = await resolveBackupDownloadPath(String(file));
    res.download(filePath);
  } catch (error) {
    if (errMsg(error) === "Invalid backup filename") {
      res.status(400).send("Invalid file name");
      return;
    }
    if (errMsg(error) === "Backup file not found") {
      res.status(404).send("Not found");
      return;
    }
    log.error("admin_backup_download_failed", { message: errMsg(error) });
    res.status(500).send("Download failed");
  }
});

backupsAdminRouter.get("/download-bundle", async (req, res) => {
  try {
    const { file } = req.query;
    if (!file) {
      res.status(400).send("File name required");
      return;
    }
    const filePath = await resolveBackupBundleDownloadPath(String(file));
    res.download(filePath);
  } catch (error) {
    if (errMsg(error) === "Invalid backup bundle filename") {
      res.status(400).send("Invalid file name");
      return;
    }
    if (errMsg(error) === "Backup bundle not found") {
      res.status(404).send("Not found");
      return;
    }
    log.error("admin_backup_bundle_download_failed", { message: errMsg(error) });
    res.status(500).send("Download failed");
  }
});

backupsAdminRouter.post("/", async (_req, res) => {
  try {
    const backup = await createPostgresSqlBackup({ prisma, logger: log });
    res.json({ ok: true, message: "Backup created", backup });
  } catch (error) {
    log.error("admin_backup_create_failed", { message: errMsg(error) });
    res.status(500).json({ ok: false, message: errMsg(error) || "Backup failed" });
  }
});

backupsAdminRouter.delete("/", async (req, res) => {
  try {
    const { filename } = req.body ?? {};
    if (!filename) {
      res.status(400).json({ ok: false, message: "filename required" });
      return;
    }
    await deleteSqlBackup(String(filename));
    res.json({ ok: true, message: "Deleted" });
  } catch (error) {
    if (errMsg(error) === "Invalid backup filename") {
      res.status(400).json({ ok: false, message: "Invalid backup filename" });
      return;
    }
    log.error("admin_backup_delete_failed", { message: errMsg(error) });
    res.status(500).json({ ok: false, message: "Unable to delete backup." });
  }
});
