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

type SqlBackupListItem = {
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
      const bundleStat = await fs.stat(bundleFile);
      bundle = { name: path.basename(bundleFile), size: bundleStat.size, includedPaths: relativeTargets };
    }
  } catch (err: unknown) {
    // Non-fatal: the SQL dump is the source of truth, the bundle is best-effort.
    logger?.warn?.("admin_backup_bundle_failed", { message: errMsg(err) });
  }

  const manifest = {
    version: 1,
    filename,
    createdAt: new Date().toISOString(),
    status: "success",
    sizeBytes,
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

    try {
      const raw = await fs.readFile(metaPathForSqlFile(backupsDir, name), "utf8");
      const meta = JSON.parse(raw);
      if (meta && typeof meta === "object") {
        if (meta.status === "success" || meta.status === "failed") status = meta.status;
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

export async function resolveBackupDownloadPath(filename: unknown): Promise<string> {
  const safe = safeBackupSqlName(filename);
  if (!safe) throw new Error("Invalid backup filename");
  const backupsDir = path.resolve(getAdminBackupsDirectory());
  const full = path.resolve(path.join(backupsDir, safe));
  const rel = path.relative(backupsDir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Invalid backup filename");
  try {
    await fs.access(full);
  } catch {
    throw new Error("Backup file not found");
  }
  const realDir = await fs.realpath(backupsDir);
  const realFile = await fs.realpath(full);
  const relReal = path.relative(realDir, realFile);
  if (relReal.startsWith("..") || path.isAbsolute(relReal)) throw new Error("Invalid backup filename");
  return full;
}

export async function resolveBackupBundleDownloadPath(filename: unknown): Promise<string> {
  const safe = safeBackupBundleName(filename);
  if (!safe) throw new Error("Invalid backup bundle filename");
  const backupsDir = path.resolve(getAdminBackupsDirectory());
  const full = path.resolve(path.join(backupsDir, safe));
  const rel = path.relative(backupsDir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Invalid backup bundle filename");
  try {
    await fs.access(full);
  } catch {
    throw new Error("Backup bundle not found");
  }
  const realDir = await fs.realpath(backupsDir);
  const realFile = await fs.realpath(full);
  const relReal = path.relative(realDir, realFile);
  if (relReal.startsWith("..") || path.isAbsolute(relReal)) throw new Error("Invalid backup bundle filename");
  return full;
}
