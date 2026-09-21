import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const gdrive = await import("../../server/modules/admin/google-drive.service.ts");
const backupsSvc = await import("../../server/modules/admin/admin.backups.service.ts");

test("Google Drive client configuration returns env values or empty string", () => {
  const prevId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const prevSec = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  try {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "test-client-secret-12345";
    assert.equal(gdrive.getGoogleDriveClientId(), "test-client-id.apps.googleusercontent.com");
    assert.equal(gdrive.getGoogleDriveClientSecret(), "test-client-secret-12345");
    assert.equal(gdrive.getGoogleDriveRedirectUri(), "http://localhost");
  } finally {
    if (prevId === undefined) delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    else process.env.GOOGLE_DRIVE_CLIENT_ID = prevId;
    if (prevSec === undefined) delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    else process.env.GOOGLE_DRIVE_CLIENT_SECRET = prevSec;
  }
});

test("getGoogleDriveAuthUrl generates a valid Google OAuth consent URL", () => {
  const authUrl = gdrive.getGoogleDriveAuthUrl();
  assert.ok(authUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth"));
  assert.ok(authUrl.includes("client_id="));
  assert.ok(authUrl.includes("scope="));
  assert.ok(authUrl.includes("access_type=offline"));
  assert.ok(authUrl.includes("prompt=consent"));
  assert.ok(authUrl.includes("response_type=code"));
});

test("readGoogleDriveConfig & saveGoogleDriveConfig persist settings in BACKUP_DIR", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-gdrive-config-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;
    const initial = await gdrive.readGoogleDriveConfig();
    assert.deepEqual(initial, {});

    await gdrive.saveGoogleDriveConfig({
      folderId: "test-folder-123",
      folderName: "BlockMiner-Backups",
      refreshToken: "test-refresh-token-456",
    });

    const readBack = await gdrive.readGoogleDriveConfig();
    assert.equal(readBack.folderId, "test-folder-123");
    assert.equal(readBack.folderName, "BlockMiner-Backups");
    assert.equal(readBack.refreshToken, "test-refresh-token-456");
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("getGoogleDriveStatus reports disconnected when no refresh token is set", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-gdrive-status-"));
  const prevDir = process.env.BACKUP_DIR;
  const prevToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const prevId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const prevSec = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  try {
    process.env.BACKUP_DIR = tmpDir;
    process.env.GOOGLE_DRIVE_CLIENT_ID = "mock-client-id";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "mock-secret";
    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

    const status = await gdrive.getGoogleDriveStatus();
    assert.equal(status.isConfigured, true);
    assert.equal(status.isConnected, false);
    assert.equal(status.folderId, null);
  } finally {
    if (prevDir === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prevDir;
    if (prevToken === undefined) delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    else process.env.GOOGLE_DRIVE_REFRESH_TOKEN = prevToken;
    if (prevId === undefined) delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    else process.env.GOOGLE_DRIVE_CLIENT_ID = prevId;
    if (prevSec === undefined) delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    else process.env.GOOGLE_DRIVE_CLIENT_SECRET = prevSec;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("uploadBackupPackageToGoogleDrive rejects invalid filename", async () => {
  await assert.rejects(
    () => gdrive.uploadBackupPackageToGoogleDrive("../../etc/passwd"),
    /Invalid backup filename/
  );
  await assert.rejects(
    () => gdrive.uploadBackupPackageToGoogleDrive("not-a-backup.sql"),
    /Invalid backup filename/
  );
});

test("getValidAccessToken throws friendly error when no token exists", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-gdrive-token-"));
  const prevDir = process.env.BACKUP_DIR;
  const prevToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  try {
    process.env.BACKUP_DIR = tmpDir;
    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

    await assert.rejects(
      () => gdrive.getValidAccessToken(),
      /Google Drive is not authorized/
    );
  } finally {
    if (prevDir === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prevDir;
    if (prevToken === undefined) delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    else process.env.GOOGLE_DRIVE_REFRESH_TOKEN = prevToken;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
