/**
 * Admin backups routes — full PostgreSQL logical dumps via pg_dump,
 * multi-point corruption verification, and Google Drive Cloud Sync.
 * Mounted at /backups inside adminRouter.
 * Security: protected by requireAdminAuth + requireAdminPermission("config").
 * Audit: all operations logged to admin_audit_logs via logAdminAction.
 */
import express from "express";
import prisma from "../../core/database/prisma.js";
import {
  createPostgresSqlBackup,
  listSqlBackups,
  deleteSqlBackup,
  resolveBackupDownloadPath,
  resolveBackupBundleDownloadPath,
  verifyBackupIntegrity,
} from "./admin.backups.service.js";
import {
  getGoogleDriveStatus,
  getGoogleDriveAuthUrl,
  exchangeAuthCodeForTokens,
  uploadBackupPackageToGoogleDrive,
} from "./google-drive.service.js";
import { requireAdminPermission } from "./admin.permissions.js";
import { logAdminAction } from "./admin.audit-log.service.js";
import { logger } from "../../core/logger/index.js";

export const backupsAdminRouter = express.Router();

// Enforce RBAC permission "config" for all backup endpoints
backupsAdminRouter.use(requireAdminPermission("config"));

const log = logger.child("AdminBackup");
function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// -------------------------------------------------------------
// List Backups
// -------------------------------------------------------------
backupsAdminRouter.get("/", async (req, res) => {
  try {
    const { backups, backupsDir } = await listSqlBackups();
    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "BACKUP_LIST",
      module: "config",
      resource: "DatabaseBackup",
      newValue: { count: backups.length },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ ok: true, backups, backupsDir });
  } catch (error) {
    log.error("admin_backup_list_failed", { message: errMsg(error) });
    res.status(500).json({ ok: false, message: "Unable to list backups." });
  }
});

// -------------------------------------------------------------
// Verify Backup Integrity & Corruption Check
// -------------------------------------------------------------
backupsAdminRouter.post("/verify", async (req, res) => {
  try {
    const { filename } = req.body ?? {};
    if (!filename || typeof filename !== "string") {
      res.status(400).json({ ok: false, message: "filename is required." });
      return;
    }

    const report = await verifyBackupIntegrity(filename);

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "BACKUP_VERIFY",
      module: "config",
      resource: "DatabaseBackup",
      resourceId: filename,
      success: report.ok,
      newValue: {
        status: report.status,
        sha256: report.sha256,
        sizeBytes: report.sizeBytes,
        checks: report.checks,
        errors: report.errors,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true, report });
  } catch (error) {
    const msg = errMsg(error);
    log.error("admin_backup_verify_failed", { message: msg });
    if (msg === "Invalid backup filename") {
      res.status(400).json({ ok: false, message: "Invalid backup filename." });
      return;
    }
    if (msg === "Backup file not found") {
      res.status(404).json({ ok: false, message: "Backup file not found." });
      return;
    }
    res.status(500).json({ ok: false, message: msg || "Failed to verify backup." });
  }
});

// -------------------------------------------------------------
// Download Plain SQL Dump
// -------------------------------------------------------------
backupsAdminRouter.get("/download", async (req, res) => {
  try {
    const { file } = req.query;
    if (!file) {
      res.status(400).send("File name required");
      return;
    }
    const filePath = await resolveBackupDownloadPath(String(file));

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "BACKUP_DOWNLOAD",
      module: "config",
      resource: "DatabaseBackup",
      resourceId: String(file),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

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

// -------------------------------------------------------------
// Download Config Snapshot Bundle (.tar.gz)
// -------------------------------------------------------------
backupsAdminRouter.get("/download-bundle", async (req, res) => {
  try {
    const { file } = req.query;
    if (!file) {
      res.status(400).send("File name required");
      return;
    }
    const filePath = await resolveBackupBundleDownloadPath(String(file));

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "BACKUP_DOWNLOAD_BUNDLE",
      module: "config",
      resource: "DatabaseBackupBundle",
      resourceId: String(file),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

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

// -------------------------------------------------------------
// Create Backup (with immediate integrity audit)
// -------------------------------------------------------------
backupsAdminRouter.post("/", async (req, res) => {
  try {
    const backup = await createPostgresSqlBackup({ prisma, logger: log });

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "BACKUP_CREATE",
      module: "config",
      resource: "DatabaseBackup",
      resourceId: backup.name,
      newValue: {
        size: backup.size,
        sha256: backup.sha256,
        durationMs: backup.durationMs,
        publicTableCount: backup.publicTableCount,
        bundleName: backup.bundleName,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true, message: "Backup created and verified intact.", backup });
  } catch (error) {
    log.error("admin_backup_create_failed", { message: errMsg(error) });
    res.status(500).json({ ok: false, message: errMsg(error) || "Backup failed" });
  }
});

// -------------------------------------------------------------
// Delete Backup
// -------------------------------------------------------------
backupsAdminRouter.delete("/", async (req, res) => {
  try {
    const { filename } = req.body ?? {};
    if (!filename) {
      res.status(400).json({ ok: false, message: "filename required" });
      return;
    }
    await deleteSqlBackup(String(filename));

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "BACKUP_DELETE",
      module: "config",
      resource: "DatabaseBackup",
      resourceId: String(filename),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

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

// -------------------------------------------------------------
// Google Drive Cloud Endpoints
// -------------------------------------------------------------

/**
 * Returns Google Drive configuration and connection status.
 */
backupsAdminRouter.get("/gdrive/status", async (_req, res) => {
  try {
    const status = await getGoogleDriveStatus();
    res.json({ ok: true, status });
  } catch (error) {
    res.status(500).json({ ok: false, message: errMsg(error) });
  }
});

/**
 * Generates the Google OAuth 2.0 authorization URL for linking Drive.
 */
backupsAdminRouter.post("/gdrive/auth-url", async (_req, res) => {
  try {
    const authUrl = getGoogleDriveAuthUrl();
    res.json({ ok: true, authUrl });
  } catch (error) {
    res.status(500).json({ ok: false, message: errMsg(error) });
  }
});

/**
 * Connects Google Drive by exchanging the user's authorization code for tokens.
 */
backupsAdminRouter.post("/gdrive/connect", async (req, res) => {
  try {
    const { code } = req.body ?? {};
    if (!code || typeof code !== "string") {
      res.status(400).json({ ok: false, message: "Authorization code is required." });
      return;
    }

    const result = await exchangeAuthCodeForTokens(code);

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "BACKUP_GDRIVE_CONNECT",
      module: "config",
      resource: "GoogleDrive",
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true, message: "Google Drive connected successfully.", hasRefreshToken: Boolean(result.refreshToken) });
  } catch (error) {
    log.error("admin_backup_gdrive_connect_failed", { message: errMsg(error) });
    res.status(500).json({ ok: false, message: errMsg(error) || "Failed to connect Google Drive." });
  }
});

/**
 * Manually uploads an existing backup package (.sql, .meta.json, .bundle.tar.gz) to Google Drive.
 */
backupsAdminRouter.post("/upload-gdrive", async (req, res) => {
  try {
    const { filename } = req.body ?? {};
    if (!filename || typeof filename !== "string") {
      res.status(400).json({ ok: false, message: "filename is required." });
      return;
    }

    // Pre-flight corruption check: refuse upload if backup is corrupt
    const report = await verifyBackupIntegrity(filename);
    if (!report.ok) {
      res.status(422).json({
        ok: false,
        message: "Refusing to upload corrupted backup to Google Drive.",
        report,
      });
      return;
    }

    const uploadResult = await uploadBackupPackageToGoogleDrive(filename);

    void logAdminAction({
      adminId: req.admin?.adminId,
      adminEmail: req.admin?.email,
      sessionId: req.admin?.sessionId,
      action: "BACKUP_GDRIVE_UPLOAD",
      module: "config",
      resource: "GoogleDriveBackup",
      resourceId: filename,
      newValue: {
        fileId: uploadResult.sqlUpload.fileId,
        size: uploadResult.sqlUpload.size,
        md5Checksum: uploadResult.sqlUpload.md5Checksum,
        bundleFileId: uploadResult.bundleUpload?.fileId,
      },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({
      ok: true,
      message: "Backup successfully synced to Google Drive.",
      upload: uploadResult,
    });
  } catch (error) {
    const msg = errMsg(error);
    log.error("admin_backup_gdrive_upload_failed", { message: msg });
    if (msg === "Invalid backup filename") {
      res.status(400).json({ ok: false, message: "Invalid backup filename." });
      return;
    }
    if (msg === "Backup file not found") {
      res.status(404).json({ ok: false, message: "Backup file not found." });
      return;
    }
    res.status(500).json({ ok: false, message: msg || "Failed to upload backup to Google Drive." });
  }
});
