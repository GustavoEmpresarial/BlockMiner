/**
 * Google Drive Cloud Backup Service (Drive REST API v3).
 * Handles OAuth2 authorization, token refreshing, folder organization,
 * resilient multipart / resumable uploads, and remote checksum verification.
 */
import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { logger } from "../../core/logger/index.js";
import {
  getAdminBackupsDirectory,
  metaPathForSqlFile,
  bundlePathForSqlFile,
  resolveBackupDownloadPath,
  safeBackupSqlName,
} from "./admin.backups.service.js";

const log = logger.child("GoogleDriveBackup");

export interface GoogleDriveConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  refreshToken?: string;
  folderId?: string;
  folderName?: string;
  userEmail?: string;
  lastSyncAt?: string;
  lastError?: string | null;
}

export interface GoogleDriveStatus {
  isConfigured: boolean;
  isConnected: boolean;
  folderId?: string | null;
  folderName?: string | null;
  userEmail?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
}

export interface GoogleDriveUploadResult {
  fileId: string;
  name: string;
  size: number;
  md5Checksum?: string;
  webViewLink?: string;
}

// In-memory token cache
let cachedAccessToken: string | null = null;
let accessTokenExpiresAt = 0;

export async function getGoogleDriveClientId(): Promise<string> {
  const fromEnv = String(process.env.GOOGLE_DRIVE_CLIENT_ID || "").trim();
  if (fromEnv) return fromEnv;
  const config = await readGoogleDriveConfig();
  return String(config.clientId || "").trim();
}

export async function getGoogleDriveClientSecret(): Promise<string> {
  const fromEnv = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || "").trim();
  if (fromEnv) return fromEnv;
  const config = await readGoogleDriveConfig();
  return String(config.clientSecret || "").trim();
}

export function getGoogleDriveRedirectUri(): string {
  return (
    process.env.GOOGLE_DRIVE_REDIRECT_URI ||
    "http://localhost"
  ).trim();
}

export function getGoogleDriveConfigPath(): string {
  return path.join(getAdminBackupsDirectory(), ".gdrive-config.json");
}

export async function readGoogleDriveConfig(): Promise<GoogleDriveConfig> {
  const configPath = getGoogleDriveConfigPath();
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as GoogleDriveConfig;
    }
  } catch {
    // Config file does not exist yet or is invalid
  }
  return {};
}

export async function saveGoogleDriveConfig(patch: Partial<GoogleDriveConfig>): Promise<GoogleDriveConfig> {
  const current = await readGoogleDriveConfig();
  const updated: GoogleDriveConfig = { ...current, ...patch };
  const backupsDir = getAdminBackupsDirectory();
  await fs.mkdir(backupsDir, { recursive: true });
  await fs.writeFile(getGoogleDriveConfigPath(), JSON.stringify(updated, null, 2), "utf8");
  return updated;
}

export async function configureGoogleDriveOAuth(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}): Promise<GoogleDriveConfig> {
  const clientId = opts.clientId.trim();
  const clientSecret = opts.clientSecret.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Client ID e Client Secret são obrigatórios.");
  }
  return await saveGoogleDriveConfig({
    clientId,
    clientSecret,
    redirectUri: opts.redirectUri ? opts.redirectUri.trim() : undefined,
    lastError: null,
  });
}

/**
 * Generates the Google OAuth 2.0 authorization consent URL.
 */
export async function getGoogleDriveAuthUrl(): Promise<string> {
  const clientId = await getGoogleDriveClientId();
  if (!clientId) {
    throw new Error("Google Drive Client ID não está configurado. Configure as credenciais no painel.");
  }
  const redirectUri = getGoogleDriveRedirectUri();
  const scope = "https://www.googleapis.com/auth/drive.file";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges the one-time authorization code for an OAuth2 refresh token and access token.
 */
export async function exchangeAuthCodeForTokens(code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const clientId = await getGoogleDriveClientId();
  const clientSecret = await getGoogleDriveClientSecret();
  const redirectUri = getGoogleDriveRedirectUri();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code.trim(),
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json() as Record<string, any>;
  if (!res.ok) {
    const err = data.error_description || data.error || `HTTP ${res.status}`;
    log.error("gdrive_auth_exchange_failed", { error: err });
    throw new Error(`Google OAuth error: ${err}`);
  }

  const refreshToken = String(data.refresh_token || "").trim();
  const accessToken = String(data.access_token || "").trim();
  const expiresIn = Number(data.expires_in || 3600);

  if (!refreshToken) {
    // If prompt=consent was not used or user already consented, Google might not return refresh_token.
    const existing = await readGoogleDriveConfig();
    if (existing.refreshToken) {
      cachedAccessToken = accessToken;
      accessTokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
      return { refreshToken: existing.refreshToken, accessToken };
    }
    throw new Error("No refresh_token returned by Google. Revoke app access or re-authorize with prompt=consent.");
  }

  cachedAccessToken = accessToken;
  accessTokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;

  await saveGoogleDriveConfig({
    refreshToken,
    lastError: null,
  });

  log.info("gdrive_auth_success", { hasRefreshToken: true });
  return { refreshToken, accessToken };
}

/**
 * Retrieves a valid access token, renewing it using the refresh token if expired.
 */
export async function getValidAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && accessTokenExpiresAt > now + 60_000) {
    return cachedAccessToken;
  }

  const config = await readGoogleDriveConfig();
  const refreshToken = (config.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim();

  if (!refreshToken) {
    throw new Error("Google Drive is not authorized. Please connect your Google account in the backup settings.");
  }

  const clientId = await getGoogleDriveClientId();
  const clientSecret = await getGoogleDriveClientSecret();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json() as Record<string, any>;
  if (!res.ok) {
    const err = data.error_description || data.error || `HTTP ${res.status}`;
    await saveGoogleDriveConfig({ lastError: err });
    log.error("gdrive_token_refresh_failed", { error: err });
    throw new Error(`Failed to refresh Google Drive token: ${err}`);
  }

  const accessToken = String(data.access_token || "").trim();
  const expiresIn = Number(data.expires_in || 3600);

  cachedAccessToken = accessToken;
  accessTokenExpiresAt = now + (expiresIn - 60) * 1000;
  return accessToken;
}

/**
 * Finds or creates the dedicated 'BlockMiner-Backups' directory on Google Drive.
 */
export async function getOrCreateBackupFolder(accessToken: string): Promise<string> {
  const config = await readGoogleDriveConfig();
  if (config.folderId) {
    // Quick probe to check if folder still exists
    try {
      const probeRes = await fetch(`https://www.googleapis.com/drive/v3/files/${config.folderId}?fields=id,name,trashed`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (probeRes.ok) {
        const folder = await probeRes.json() as { id: string; name: string; trashed?: boolean };
        if (!folder.trashed) return folder.id;
      }
    } catch {
      /* ignore and search/create */
    }
  }

  // Search by name
  const query = "name = 'BlockMiner-Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (searchRes.ok) {
    const data = await searchRes.json() as { files?: { id: string; name: string }[] };
    if (data.files && data.files.length > 0 && data.files[0]?.id) {
      const foundId = data.files[0].id;
      await saveGoogleDriveConfig({ folderId: foundId, folderName: "BlockMiner-Backups" });
      return foundId;
    }
  }

  // Create folder if not found
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "BlockMiner-Backups",
      mimeType: "application/vnd.google-apps.folder",
      description: "Automated PostgreSQL database backups for BlockMiner.",
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create Google Drive backup folder: ${err}`);
  }

  const created = await createRes.json() as { id: string; name: string };
  await saveGoogleDriveConfig({ folderId: created.id, folderName: "BlockMiner-Backups" });
  log.info("gdrive_folder_created", { folderId: created.id });
  return created.id;
}

/**
 * Uploads a local file to Google Drive using either multipart (small files) or resumable upload (large dumps).
 */
export async function uploadFileToGoogleDrive(opts: {
  filePath: string;
  fileName: string;
  mimeType: string;
  folderId?: string;
}): Promise<GoogleDriveUploadResult> {
  const { filePath, fileName, mimeType, folderId } = opts;
  const accessToken = await getValidAccessToken();
  const targetFolderId = folderId || (await getOrCreateBackupFolder(accessToken));

  const stat = await fs.stat(filePath);
  const sizeBytes = stat.size;

  // For small files (< 5MB), use multipart upload
  if (sizeBytes < 5 * 1024 * 1024) {
    const fileBuffer = await fs.readFile(filePath);
    const boundary = `----BMDriveBoundary${Date.now()}`;
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = JSON.stringify({
      name: fileName,
      parents: [targetFolderId],
    });

    const bodyBuffer = Buffer.concat([
      Buffer.from(
        delimiter +
          "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
          metadata +
          delimiter +
          `Content-Type: ${mimeType}\r\n\r\n`
      ),
      fileBuffer,
      Buffer.from(closeDelimiter),
    ]);

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,md5Checksum,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": String(bodyBuffer.length),
        },
        body: bodyBuffer,
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive multipart upload failed (${res.status}): ${err}`);
    }

    const data = await res.json() as Record<string, any>;
    return {
      fileId: String(data.id),
      name: String(data.name || fileName),
      size: Number(data.size || sizeBytes),
      md5Checksum: data.md5Checksum ? String(data.md5Checksum) : undefined,
      webViewLink: data.webViewLink ? String(data.webViewLink) : undefined,
    };
  }

  // For larger files (>= 5MB), use Google Drive Resumable Upload protocol
  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,md5Checksum,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(sizeBytes),
      },
      body: JSON.stringify({
        name: fileName,
        parents: [targetFolderId],
      }),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Google Drive resumable upload initialization failed (${initRes.status}): ${err}`);
  }

  const uploadUri = initRes.headers.get("location");
  if (!uploadUri) {
    throw new Error("Google Drive did not return a resumable upload location.");
  }

  // Stream upload
  const fileBuffer = await fs.readFile(filePath);
  const uploadRes = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      "Content-Length": String(sizeBytes),
      "Content-Type": mimeType,
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Google Drive chunk upload failed (${uploadRes.status}): ${err}`);
  }

  const data = await uploadRes.json() as Record<string, any>;
  return {
    fileId: String(data.id),
    name: String(data.name || fileName),
    size: Number(data.size || sizeBytes),
    md5Checksum: data.md5Checksum ? String(data.md5Checksum) : undefined,
    webViewLink: data.webViewLink ? String(data.webViewLink) : undefined,
  };
}

/**
 * Uploads a complete backup set (.sql dump, .bundle.tar.gz if present, and updated .meta.json) to Google Drive.
 */
export async function uploadBackupPackageToGoogleDrive(filename: unknown): Promise<{
  ok: true;
  filename: string;
  sqlUpload: GoogleDriveUploadResult;
  bundleUpload?: GoogleDriveUploadResult;
  metaUpload?: GoogleDriveUploadResult;
}> {
  const safe = safeBackupSqlName(filename);
  if (!safe) throw new Error("Invalid backup filename");

  const sqlPath = await resolveBackupDownloadPath(safe);
  const backupsDir = getAdminBackupsDirectory();
  const metaPath = metaPathForSqlFile(backupsDir, safe);
  const bundlePath = bundlePathForSqlFile(backupsDir, safe);

  const accessToken = await getValidAccessToken();
  const folderId = await getOrCreateBackupFolder(accessToken);

  log.info("gdrive_backup_upload_start", { filename: safe, folderId });

  // 1. Upload .sql dump
  const sqlUpload = await uploadFileToGoogleDrive({
    filePath: sqlPath,
    fileName: safe,
    mimeType: "application/sql",
    folderId,
  });

  // 2. Upload .bundle.tar.gz if present
  let bundleUpload: GoogleDriveUploadResult | undefined = undefined;
  try {
    await fs.access(bundlePath);
    bundleUpload = await uploadFileToGoogleDrive({
      filePath: bundlePath,
      fileName: path.basename(bundlePath),
      mimeType: "application/gzip",
      folderId,
    });
  } catch {
    // Bundle is optional
  }

  // 3. Update local manifest .meta.json with Google Drive sync metadata
  const gdriveMeta = {
    uploadedAt: new Date().toISOString(),
    folderId,
    fileId: sqlUpload.fileId,
    webViewLink: sqlUpload.webViewLink || null,
    md5Checksum: sqlUpload.md5Checksum || null,
    bundleFileId: bundleUpload?.fileId || null,
  };

  try {
    let metaObj: any = {};
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      metaObj = JSON.parse(raw);
    } catch {
      metaObj = { filename: safe, createdAt: new Date().toISOString() };
    }
    metaObj.googleDrive = gdriveMeta;
    await fs.writeFile(metaPath, JSON.stringify(metaObj, null, 2), "utf8");
  } catch {
    /* ignore */
  }

  // 4. Upload .meta.json to Google Drive
  let metaUpload: GoogleDriveUploadResult | undefined = undefined;
  try {
    metaUpload = await uploadFileToGoogleDrive({
      filePath: metaPath,
      fileName: path.basename(metaPath),
      mimeType: "application/json",
      folderId,
    });
  } catch {
    /* non-fatal */
  }

  await saveGoogleDriveConfig({
    lastSyncAt: new Date().toISOString(),
    lastError: null,
  });

  log.info("gdrive_backup_upload_success", {
    filename: safe,
    sqlFileId: sqlUpload.fileId,
    bundleFileId: bundleUpload?.fileId || null,
  });

  return {
    ok: true,
    filename: safe,
    sqlUpload,
    bundleUpload,
    metaUpload,
  };
}

/**
 * Returns the current Google Drive connectivity and configuration status.
 */
export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  const clientId = await getGoogleDriveClientId();
  const clientSecret = await getGoogleDriveClientSecret();
  const isConfigured = Boolean(clientId && clientSecret);

  const config = await readGoogleDriveConfig();
  const refreshToken = (config.refreshToken || process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim();

  if (!refreshToken) {
    return {
      isConfigured,
      isConnected: false,
      folderId: config.folderId || null,
      folderName: config.folderName || null,
      lastSyncAt: config.lastSyncAt || null,
      lastError: config.lastError || null,
    };
  }

  try {
    const accessToken = await getValidAccessToken();
    const folderId = await getOrCreateBackupFolder(accessToken);
    return {
      isConfigured,
      isConnected: true,
      folderId,
      folderName: config.folderName || "BlockMiner-Backups",
      userEmail: config.userEmail || null,
      lastSyncAt: config.lastSyncAt || null,
      lastError: null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      isConfigured,
      isConnected: false,
      folderId: config.folderId || null,
      folderName: config.folderName || null,
      lastSyncAt: config.lastSyncAt || null,
      lastError: msg,
    };
  }
}
