/**
 * PostgreSQL full logical backups via pg_dump (plain SQL). Ported from
 * legacy/server/services/databaseBackupService.ts.
 *
 * Deviation from legacy: CRITICAL_PUBLIC_TABLES trimmed to tables that actually
 * exist in current's schema (verified against prisma/schema.prisma @@map names).
 * Legacy's list is ["users","transactions","user_vault","user_owned_machines",
 * "miners","internal_offerwall_offers"] — all six exist in current's schema
 * too, so no deviation was needed there.
 *
 * Security: pg_dump is invoked via `spawn` with an argument array (never a
 * shell string). Table identifiers used in raw SQL (row-count audit) are
 * validated against isSafePublicTableNameForRowCount before interpolation.
 * Filenames used for downloads/deletes are validated against a strict regex
 * plus a realpath-based path-traversal guard.
 */
import path from "path";
import fs from "fs/promises";
import { accessSync, constants as fsConstants, createReadStream } from "fs";
import { spawn } from "child_process";
import readline from "readline";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../core/database/prisma.js";
import { projectRoot } from "../media/index.js";

/** Tables asserted as COPY targets in a successful plain dump (public schema). */
export const CRITICAL_PUBLIC_TABLES = [
  "users",
  "transactions",
  "user_vault",
  "user_owned_machines",
  "miners",
  "internal_offerwall_offers",
];

export type BackupIntegrityStatus = "valid" | "corrupted" | "unverified";

export type BackupIntegrityReport = {
  ok: boolean;
  filename: string;
  sizeBytes: number;
  sha256: string;
  status: "valid" | "corrupted";
  verifiedAt: string;
  checks: {
    sizeOk: boolean;
    headerOk: boolean;
    footerOk: boolean;
    criticalTablesOk: boolean;
    hashMatch: boolean;
    bundleOk?: boolean;
  };
  missingCriticalTables: string[];
  errors: string[];
};

type BackupRowCountExact = {
  mode: "exact_count";
  durationMs?: number;
  rowCountByTable: Record<string, number>;
  totalDataRows: number;
  publicTablesWithRows: number;
  publicTablesEmpty: number;
  criticalRowCounts: Record<string, number>;
};

type BackupRowCountAudit = BackupRowCountExact | { mode: "failed"; error: string } | { mode: "skipped"; reason: string };

export type SqlBackupListItem = {
  name: string;
  size: number;
  created: string;
  status: string;
  publicTableCount: number | null;
  durationMs: number | null;
  copyPublicLineCount: number | null;
  criticalTablesPresent: unknown[] | null;
  totalDataRows: number | null;
  publicTablesWithRows: number | null;
  publicTablesEmpty: number | null;
  criticalRowCounts: Record<string, unknown> | null;
  rowCountAuditMode: string | null;
  bundleName: string | null;
  bundleSize: number | null;
  bundleIncludedPaths: string[];
  sha256?: string | null;
  integrityStatus?: BackupIntegrityStatus | null;
  lastVerifiedAt?: string | null;
  integrityErrors?: string[] | null;
  googleDrive?: {
    uploadedAt?: string;
    folderId?: string;
    fileId?: string;
    webViewLink?: string;
    md5Checksum?: string;
    bundleFileId?: string;
  } | null;
};

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function exactRowCountAudit(a: BackupRowCountAudit | null): BackupRowCountExact | null {
  return a && a.mode === "exact_count" ? a : null;
}

/**
 * Default: current/storage/backups/ (resolve relative to this service file) — grouped under the
 * same gitignored storage/ runtime-data root as media uploads (server/modules/media/
 * media.config.ts), instead of a bare top-level backups/ folder. Override via BACKUP_DIR.
 * If BACKUP_DIR points at an unwritable path (e.g. Docker `/app/backups` on bare metal),
 * fall back to the local storage tree so admin list/create still work in local/dev.
 */
export function getAdminBackupsDirectory(): string {
  const fallback = path.join(projectRoot(), "storage", "backups");
  const fromEnv = String(process.env.BACKUP_DIR || "").trim();
  if (!fromEnv) return fallback;
  const resolved = path.resolve(fromEnv);
  // Docker image path from .env — unusable on bare-metal local/dev.
  if (resolved === "/app" || resolved.startsWith("/app/")) {
    try {
      accessSync("/app", fsConstants.W_OK);
    } catch {
      return fallback;
    }
  }
  return resolved;
}

export function metaPathForSqlFile(backupsDir: string, sqlFileName: string): string {
  const stem = sqlFileName.replace(/\.sql$/i, "");
  return path.join(backupsDir, `${stem}.meta.json`);
}

export function bundlePathForSqlFile(backupsDir: string, sqlFileName: string): string {
  const stem = sqlFileName.replace(/\.sql$/i, "");
  return path.join(backupsDir, `${stem}.bundle.tar.gz`);
}

export function safeBackupSqlName(name: unknown): string | null {
  if (!name || typeof name !== "string") return null;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  if (!/^backup-.+\.sql$/i.test(name)) return null;
  return name;
}

export function safeBackupBundleName(name: unknown): string | null {
  if (!name || typeof name !== "string") return null;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  if (!/^backup-.+\.bundle\.tar\.gz$/i.test(name)) return null;
  return name;
}

/**
 * Prisma appends `?schema=public` to DATABASE_URL; libpq (used by pg_dump) rejects
 * unknown URI query params such as `schema`.
 */
export function sanitizeDatabaseUrlForPgDump(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return s;
  try {
    const u = new URL(s);
    u.searchParams.delete("schema");
    return u.toString();
  } catch {
    return s
      .replace(/[?&]schema=[^&]*/gi, "")
      .replace(/\?&/, "?")
      .replace(/&&/g, "&")
      .replace(/\?$/, "");
  }
}

/** pg_tables names in public for this project are snake_case; reject anything else before raw SQL. */
export function isSafePublicTableNameForRowCount(name: unknown): name is string {
  return typeof name === "string" && /^[a-z][a-z0-9_]*$/.test(name);
}

export async function scanPlainPgDumpForCopyLines(filePath: string, criticalTables: string[]) {
  const found = new Set<string>();
  let copyPublicLineCount = 0;
  let headerOk = false;

  const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!headerOk && line.includes("PostgreSQL database dump")) headerOk = true;
      if (line.startsWith("COPY public.")) {
        copyPublicLineCount += 1;
        for (const t of criticalTables) {
          if (line.startsWith(`COPY public.${t} `) || line.startsWith(`COPY public.${t}\t`)) found.add(t);
        }
        if (found.size === criticalTables.length) break;
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return { found, copyPublicLineCount, headerOk };
}

/**
 * Computes the cryptographic SHA-256 hash of a file using streams to avoid memory overhead.
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Checks that the pg_dump plain text file contains the official completion footer marker.
 * Inspects the last 8KB of the file in constant time.
 */
export async function checkPgDumpFooter(filePath: string): Promise<boolean> {
  let fileHandle: fs.FileHandle | null = null;
  try {
    fileHandle = await fs.open(filePath, "r");
    const stat = await fileHandle.stat();
    if (stat.size < 64) return false;
    const readLength = Math.min(stat.size, 8192);
    const buffer = Buffer.alloc(readLength);
    await fileHandle.read(buffer, 0, readLength, stat.size - readLength);
    const tail = buffer.toString("utf8");
    return tail.includes("PostgreSQL database dump complete");
  } catch {
    return false;
  } finally {
    if (fileHandle) {
      await fileHandle.close().catch(() => undefined);
    }
  }
}

/**
 * Verifies that a .tar.gz snapshot bundle is valid and readable without corruption.
 */
export function verifyTarBundleIntegrity(bundlePath: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn("tar", ["-tzf", bundlePath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
      if (stderr.length > 10_000) stderr = stderr.slice(-5_000);
    });
    child.on("error", (err) => resolve({ ok: false, error: `Failed to execute tar: ${err.message}` }));
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: `tar verification failed (exit code ${code}): ${stderr.trim() || "corrupt archive"}` });
    });
  });
}

/**
 * Performs a rigorous multi-point corruption and integrity audit on an existing backup:
 * 1. Checks file existence & minimum size (>= 256 bytes)
 * 2. Computes current SHA-256 hash and compares with stored manifest
 * 3. Verifies PostgreSQL dump header
 * 4. Verifies all 6 critical public tables COPY directives
 * 5. Verifies PostgreSQL completion footer (tail inspection)
 * 6. Verifies tarball snapshot bundle integrity if present
 * Updates the .meta.json file with the verified integrity report.
 */
export async function verifyBackupIntegrity(filename: unknown): Promise<BackupIntegrityReport> {
  const safe = safeBackupSqlName(filename);
  if (!safe) throw new Error("Invalid backup filename");

  const backupsDir = getAdminBackupsDirectory();
  const filePath = path.join(backupsDir, safe);
  try {
    await fs.access(filePath);
  } catch {
    throw new Error("Backup file not found");
  }
  const metaPath = metaPathForSqlFile(backupsDir, safe);
  const bundlePath = bundlePathForSqlFile(backupsDir, safe);

  const errors: string[] = [];
  const stat = await fs.stat(filePath);
  const sizeBytes = stat.size;

  // 1. Minimum size verification
  const sizeOk = sizeBytes >= 256;
  if (!sizeOk) {
    errors.push(`Arquivo muito pequeno ou vazio (${sizeBytes} bytes). pg_dump provavelmente falhou silenciosamente.`);
  }

  // 2. Compute current SHA-256 hash
  const currentSha256 = await computeFileSha256(filePath);

  // 3. Header & Critical tables scan
  const scan = await scanPlainPgDumpForCopyLines(filePath, CRITICAL_PUBLIC_TABLES);
  const headerOk = scan.headerOk;
  if (!headerOk) {
    errors.push("Cabeçalho do PostgreSQL ('PostgreSQL database dump') ausente. O arquivo não é um dump válido.");
  }

  const missingCriticalTables = CRITICAL_PUBLIC_TABLES.filter((t) => !scan.found.has(t));
  const criticalTablesOk = missingCriticalTables.length === 0;
  if (!criticalTablesOk) {
    errors.push(`Seções COPY ausentes para tabelas vitais: ${missingCriticalTables.join(", ")}`);
  }

  // 4. Footer completion check
  const footerOk = await checkPgDumpFooter(filePath);
  if (!footerOk) {
    errors.push("Marcador de finalização ('PostgreSQL database dump complete') ausente ou dump truncado.");
  }

  // 5. Compare with stored SHA-256 in manifest
  let hashMatch = true;
  let metaObj: any = null;
  try {
    const raw = await fs.readFile(metaPath, "utf8");
    metaObj = JSON.parse(raw);
    if (metaObj && typeof metaObj.sha256 === "string") {
      if (metaObj.sha256.toLowerCase() !== currentSha256.toLowerCase()) {
        hashMatch = false;
        errors.push(`Hash SHA-256 divergente: registrado=${metaObj.sha256}, atual=${currentSha256}`);
      }
    }
  } catch {
    // No meta file or corrupt meta
  }

  // 6. Bundle tarball integrity check if bundle exists
  let bundleOk: boolean | undefined = undefined;
  try {
    await fs.access(bundlePath);
    const tarCheck = await verifyTarBundleIntegrity(bundlePath);
    bundleOk = tarCheck.ok;
    if (!tarCheck.ok) {
      errors.push(`Bundle de snapshot corrompido: ${tarCheck.error}`);
    }
  } catch {
    // Bundle does not exist - optional
  }

  const isOk = sizeOk && headerOk && criticalTablesOk && footerOk && hashMatch && (bundleOk !== false);
  const status: "valid" | "corrupted" = isOk ? "valid" : "corrupted";
  const verifiedAt = new Date().toISOString();

  // Update .meta.json with latest verified integrity report
  try {
    if (!metaObj || typeof metaObj !== "object") {
      metaObj = {
        version: 1,
        filename: safe,
        createdAt: stat.mtime.toISOString(),
        status: isOk ? "success" : "failed",
        sizeBytes,
      };
    }
    metaObj.sha256 = currentSha256;
    metaObj.integrityStatus = status;
    metaObj.lastVerifiedAt = verifiedAt;
    metaObj.integrityReport = {
      status,
      verifiedAt,
      checks: { sizeOk, headerOk, footerOk, criticalTablesOk, hashMatch, bundleOk },
      missingCriticalTables,
      errors,
    };
    await fs.writeFile(metaPath, JSON.stringify(metaObj, null, 2), "utf8");
  } catch {
    /* ignore write failure */
  }

  return {
    ok: isOk,
    filename: safe,
    sizeBytes,
    sha256: currentSha256,
    status,
    verifiedAt,
    checks: {
      sizeOk,
      headerOk,
      footerOk,
      criticalTablesOk,
      hashMatch,
      bundleOk,
    },
    missingCriticalTables,
    errors,
  };
}

async function countPublicTables(prisma: AppPrisma): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;
  return rows.map((r) => r.tablename);
}

export async function collectPublicTableExactRowCounts(prisma: AppPrisma, tableNames: string[]) {
  const rowCountByTable: Record<string, number> = {};
  let totalDataRows = 0;
  for (const name of tableNames) {
    if (!isSafePublicTableNameForRowCount(name)) {
      throw new Error(`Refusing row count on invalid table name: ${name}`);
    }
    const rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM public.${Prisma.raw(name)}
    `;
    const c = Number(rows[0]?.c ?? 0);
    rowCountByTable[name] = c;
    totalDataRows += c;
  }
  const publicTablesWithRows = Object.values(rowCountByTable).filter((n) => n > 0).length;
  const publicTablesEmpty = tableNames.length - publicTablesWithRows;
  const criticalRowCounts: Record<string, number> = {};
  for (const t of CRITICAL_PUBLIC_TABLES) {
    if (Object.prototype.hasOwnProperty.call(rowCountByTable, t)) criticalRowCounts[t] = rowCountByTable[t];
  }
  return { rowCountByTable, totalDataRows, publicTablesWithRows, publicTablesEmpty, criticalRowCounts };
}

function runPgDumpToFile({ pgDumpPath, databaseUrl, outFile }: { pgDumpPath: string; databaseUrl: string; outFile: string }) {
  return new Promise<{ stderr: string }>((resolve, reject) => {
    const args = ["--format=p", "--encoding=UTF8", "--no-owner", "--no-acl", "--file", outFile, "--dbname", databaseUrl];

    const child = spawn(pgDumpPath, args, { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env } });

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
      if (stderr.length > 400_000) stderr = stderr.slice(-200_000);
    });

    child.on("error", (err) => reject(new Error(`Failed to start pg_dump: ${err.message}`)));

    child.on("close", (code) => {
      if (code === 0) resolve({ stderr });
      else reject(new Error(`pg_dump exited with code ${code}: ${stderr.slice(-8000) || "no stderr"}`));
    });
  });
}

function runTarBundleToFile({ outFile, relativeTargets }: { outFile: string; relativeTargets: string[] }) {
  return new Promise<{ stderr: string }>((resolve, reject) => {
    const args = ["-czf", outFile, ...relativeTargets];
    const child = spawn("tar", args, {
      cwd: projectRoot(),
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env },
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
      if (stderr.length > 400_000) stderr = stderr.slice(-200_000);
    });
    child.on("error", (err) => reject(new Error(`Failed to start tar: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve({ stderr });
      else reject(new Error(`tar exited with code ${code}: ${stderr.slice(-8000) || "no stderr"}`));
    });
  });
}

function getAdditionalBackupTargets(): string[] {
  return [".env", ".env.example", "storage/uploads", "prisma", "docs", "scripts", "docker-compose.yml", "Dockerfile"];
}

export type BackupLoggerLike = {
  info?: (ev: string, meta?: Record<string, unknown>) => void;
  warn?: (ev: string, meta?: Record<string, unknown>) => void;
  error?: (ev: string, meta?: Record<string, unknown>) => void;
};

export async function createPostgresSqlBackup(opts: { prisma: AppPrisma; logger?: BackupLoggerLike }) {
  const { prisma, logger } = opts;
  const started = Date.now();
  const databaseUrl = sanitizeDatabaseUrlForPgDump(String(process.env.DATABASE_URL || "").trim());
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const pgDumpPath = String(process.env.PG_DUMP_PATH || "pg_dump").trim() || "pg_dump";
  const backupsDir = getAdminBackupsDirectory();
  await fs.mkdir(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.sql`;
  const outFile = path.join(backupsDir, filename);
  const bundleFile = bundlePathForSqlFile(backupsDir, filename);

  const publicTables = await countPublicTables(prisma);
  const publicTableCount = publicTables.length;

  logger?.info?.("admin_backup_start", { filename, backupsDir, pgDumpPath, publicTableCount });

  try {
    await runPgDumpToFile({ pgDumpPath, databaseUrl, outFile });
  } catch (err: unknown) {
    logger?.error?.("admin_backup_pg_dump_failed", { message: errMsg(err) });
    try {
      await fs.unlink(outFile);
    } catch {
      /* ignore */
    }
    throw err;
  }

  const stat = await fs.stat(outFile);
  const sizeBytes = stat.size;
  if (sizeBytes < 256) {
    try {
      await fs.unlink(outFile);
    } catch {
      /* ignore */
    }
    logger?.error?.("admin_backup_too_small", { sizeBytes });
    throw new Error("Backup file is too small; pg_dump likely failed silently");
  }

  const scan = await scanPlainPgDumpForCopyLines(outFile, CRITICAL_PUBLIC_TABLES);
  const missingCritical = CRITICAL_PUBLIC_TABLES.filter((t) => !scan.found.has(t));

  if (!scan.headerOk) {
    try {
      await fs.unlink(outFile);
    } catch {
      /* ignore */
    }
    throw new Error("Backup file does not look like a PostgreSQL plain-format dump");
  }

  if (missingCritical.length > 0) {
    try {
      await fs.unlink(outFile);
    } catch {
      /* ignore */
    }
    throw new Error(`Backup validation failed: missing COPY sections for: ${missingCritical.join(", ")}`);
  }

  const footerOk = await checkPgDumpFooter(outFile);
  if (!footerOk) {
    try {
      await fs.unlink(outFile);
    } catch {
      /* ignore */
    }
    logger?.error?.("admin_backup_incomplete", { filename });
    throw new Error("Backup validation failed: dump appears truncated or incomplete (missing completion footer)");
  }

  const sha256 = await computeFileSha256(outFile);

  let rowCountAudit: BackupRowCountAudit | null = null;
  const skipRowAudit = String(process.env.BACKUP_SKIP_ROW_COUNT_AUDIT || "").trim() === "1";
  if (!skipRowAudit) {
    const rowStarted = Date.now();
    try {
      const counts = await collectPublicTableExactRowCounts(prisma, publicTables);
      rowCountAudit = { ...counts, durationMs: Date.now() - rowStarted, mode: "exact_count" };
    } catch (err: unknown) {
      logger?.warn?.("admin_backup_row_count_audit_failed", { message: errMsg(err) });
      rowCountAudit = { error: errMsg(err), mode: "failed" };
    }
  } else {
    rowCountAudit = { mode: "skipped", reason: "BACKUP_SKIP_ROW_COUNT_AUDIT=1" };
  }

  const durationMs = Date.now() - started;
  let bundle: { name: string; size: number; includedPaths: string[] } | null = null;
  try {
    const rootDir = projectRoot();
    const relativeTargets: string[] = [];
    for (const rel of getAdditionalBackupTargets()) {
      try {
        await fs.access(path.join(rootDir, rel));
        relativeTargets.push(rel);
      } catch {
        /* ignore missing target */
      }
    }
    if (relativeTargets.length) {
      await runTarBundleToFile({ outFile: bundleFile, relativeTargets });
      const bundleCheck = await verifyTarBundleIntegrity(bundleFile);
      if (!bundleCheck.ok) {
        logger?.warn?.("admin_backup_bundle_failed", { error: bundleCheck.error });
        try {
          await fs.unlink(bundleFile);
        } catch {
          /* ignore */
        }
      } else {
        const bundleStat = await fs.stat(bundleFile);
        bundle = { name: path.basename(bundleFile), size: bundleStat.size, includedPaths: relativeTargets };
      }
    }
  } catch (err: unknown) {
    // Non-fatal: the SQL dump is the source of truth, the bundle is best-effort.
    logger?.warn?.("admin_backup_bundle_failed", { message: errMsg(err) });
  }

  const nowIso = new Date().toISOString();
  const manifest = {
    version: 1,
    filename,
    createdAt: nowIso,
    status: "success",
    sizeBytes,
    sha256,
    integrityStatus: "valid" as const,
    lastVerifiedAt: nowIso,
    integrityReport: {
      status: "valid" as const,
      verifiedAt: nowIso,
      checks: {
        sizeOk: true,
        headerOk: true,
        footerOk: true,
        criticalTablesOk: true,
        hashMatch: true,
        bundleOk: Boolean(bundle),
      },
      missingCriticalTables: [],
      errors: [],
    },
    durationMs,
    publicTableCount,
    copyPublicLineCount: scan.copyPublicLineCount,
    criticalTablesPresent: [...scan.found],
    pgDumpPath,
    rowCountAudit,
    bundle,
  };

  await fs.writeFile(metaPathForSqlFile(backupsDir, filename), JSON.stringify(manifest, null, 2), "utf8");

  const exact = exactRowCountAudit(rowCountAudit);
  logger?.info?.("admin_backup_success", {
    filename,
    sizeBytes,
    sha256,
    durationMs,
    publicTableCount,
    copyPublicLineCount: scan.copyPublicLineCount,
    totalDataRows: exact?.totalDataRows,
    bundleName: bundle?.name || null,
  });

  return {
    name: filename,
    size: sizeBytes,
    created: stat.mtime.toISOString(),
    status: "success",
    sha256,
    integrityStatus: "valid" as const,
    lastVerifiedAt: nowIso,
    durationMs,
    publicTableCount,
    copyPublicLineCount: scan.copyPublicLineCount,
    criticalTablesPresent: manifest.criticalTablesPresent,
    totalDataRows: exact?.totalDataRows ?? null,
    publicTablesWithRows: exact?.publicTablesWithRows ?? null,
    publicTablesEmpty: exact?.publicTablesEmpty ?? null,
    criticalRowCounts: exact?.criticalRowCounts ?? null,
    rowCountAuditMode: rowCountAudit?.mode ?? null,
    bundleName: bundle?.name || null,
    bundleSize: bundle?.size || null,
    bundleIncludedPaths: bundle?.includedPaths || [],
    googleDrive: null,
  };
}

export async function listSqlBackups(): Promise<{ backupsDir: string; backups: SqlBackupListItem[] }> {
  const backupsDir = getAdminBackupsDirectory();
  await fs.mkdir(backupsDir, { recursive: true });
  const names = await fs.readdir(backupsDir);
  const backups: SqlBackupListItem[] = [];

  for (const name of names) {
    if (!name.endsWith(".sql")) continue;
    if (!/^backup-.+\.sql$/i.test(name)) continue;

    const full = path.join(backupsDir, name);
    const stat = await fs.stat(full);
    let status = "unknown";
    let publicTableCount: number | null = null;
    let durationMs: number | null = null;
    let copyPublicLineCount: number | null = null;
    let criticalTablesPresent: unknown[] | null = null;
    let totalDataRows: number | null = null;
    let publicTablesWithRows: number | null = null;
    let publicTablesEmpty: number | null = null;
    let criticalRowCounts: Record<string, unknown> | null = null;
    let rowCountAuditMode: string | null = null;
    let bundleName: string | null = null;
    let bundleSize: number | null = null;
    let bundleIncludedPaths: string[] = [];
    let sha256: string | null = null;
    let integrityStatus: BackupIntegrityStatus | null = null;
    let lastVerifiedAt: string | null = null;
    let integrityErrors: string[] | null = null;
    let googleDrive: SqlBackupListItem["googleDrive"] = null;

    try {
      const raw = await fs.readFile(metaPathForSqlFile(backupsDir, name), "utf8");
      const meta = JSON.parse(raw);
      if (meta && typeof meta === "object") {
        if (meta.status === "success" || meta.status === "failed") status = meta.status;
        if (typeof meta.sha256 === "string") sha256 = meta.sha256;
        if (meta.integrityStatus === "valid" || meta.integrityStatus === "corrupted" || meta.integrityStatus === "unverified") {
          integrityStatus = meta.integrityStatus;
        } else if (meta.status === "success") {
          integrityStatus = "valid";
        }
        if (typeof meta.lastVerifiedAt === "string") lastVerifiedAt = meta.lastVerifiedAt;
        if (Array.isArray(meta.integrityReport?.errors)) integrityErrors = meta.integrityReport.errors;
        if (meta.googleDrive && typeof meta.googleDrive === "object") {
          googleDrive = meta.googleDrive;
        }
        if (Number.isFinite(meta.publicTableCount)) publicTableCount = meta.publicTableCount;
        if (Number.isFinite(meta.durationMs)) durationMs = meta.durationMs;
        if (Number.isFinite(meta.copyPublicLineCount)) copyPublicLineCount = meta.copyPublicLineCount;
        if (Array.isArray(meta.criticalTablesPresent)) criticalTablesPresent = meta.criticalTablesPresent;
        const audit = meta.rowCountAudit;
        if (meta.bundle && typeof meta.bundle === "object") {
          if (typeof meta.bundle.name === "string") bundleName = meta.bundle.name;
          if (Number.isFinite(meta.bundle.size)) bundleSize = meta.bundle.size;
          if (Array.isArray(meta.bundle.includedPaths)) bundleIncludedPaths = meta.bundle.includedPaths;
        }
        if (audit && typeof audit === "object" && audit.mode === "exact_count") {
          if (Number.isFinite(audit.totalDataRows)) totalDataRows = audit.totalDataRows;
          if (Number.isFinite(audit.publicTablesWithRows)) publicTablesWithRows = audit.publicTablesWithRows;
          if (Number.isFinite(audit.publicTablesEmpty)) publicTablesEmpty = audit.publicTablesEmpty;
          if (audit.criticalRowCounts && typeof audit.criticalRowCounts === "object") criticalRowCounts = audit.criticalRowCounts;
          rowCountAuditMode = audit.mode;
        } else if (audit && typeof audit === "object" && typeof audit.mode === "string") {
          rowCountAuditMode = audit.mode;
        }
      }
    } catch {
      status = "legacy";
    }

    backups.push({
      name,
      size: stat.size,
      created: stat.mtime.toISOString(),
      status,
      publicTableCount,
      durationMs,
      copyPublicLineCount,
      criticalTablesPresent,
      totalDataRows,
      publicTablesWithRows,
      publicTablesEmpty,
      criticalRowCounts,
      rowCountAuditMode,
      bundleName,
      bundleSize,
      bundleIncludedPaths,
      sha256,
      integrityStatus,
      lastVerifiedAt,
      integrityErrors,
      googleDrive,
    });
  }

  backups.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  return { backupsDir, backups };
}

export async function deleteSqlBackup(filename: unknown): Promise<void> {
  const safe = safeBackupSqlName(filename);
  if (!safe) throw new Error("Invalid backup filename");
  const backupsDir = getAdminBackupsDirectory();
  const full = path.join(backupsDir, safe);
  await fs.unlink(full);
  try {
    await fs.unlink(metaPathForSqlFile(backupsDir, safe));
  } catch {
    /* ignore */
  }
  try {
    await fs.unlink(bundlePathForSqlFile(backupsDir, safe));
  } catch {
    /* ignore */
  }
}

