import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const svc = await import("../../server/modules/admin/admin.backups.service.ts");

test("safeBackupSqlName rejects path traversal / non-matching names", () => {
  assert.equal(svc.safeBackupSqlName("backup-2026-01-01.sql"), "backup-2026-01-01.sql");
  assert.equal(svc.safeBackupSqlName("../../etc/passwd"), null);
  assert.equal(svc.safeBackupSqlName("backup-../x.sql"), null);
  assert.equal(svc.safeBackupSqlName("backup-x.sql/../../etc"), null);
  assert.equal(svc.safeBackupSqlName("notabackup.sql"), null);
  assert.equal(svc.safeBackupSqlName(""), null);
  assert.equal(svc.safeBackupSqlName(null), null);
});

test("safeBackupBundleName rejects path traversal / non-matching names", () => {
  assert.equal(svc.safeBackupBundleName("backup-2026-01-01.bundle.tar.gz"), "backup-2026-01-01.bundle.tar.gz");
  assert.equal(svc.safeBackupBundleName("../../etc/passwd"), null);
  assert.equal(svc.safeBackupBundleName("backup-x.tar.gz"), null); // not .bundle.tar.gz
});

test("sanitizeDatabaseUrlForPgDump strips the Prisma ?schema= query param", () => {
  const raw = "postgresql://user:pass@localhost:5433/db?schema=public";
  const cleaned = svc.sanitizeDatabaseUrlForPgDump(raw);
  assert.ok(!cleaned.includes("schema="), `expected no schema param, got: ${cleaned}`);
  assert.ok(cleaned.startsWith("postgresql://user:pass@localhost:5433/db"));
});

test("sanitizeDatabaseUrlForPgDump keeps other query params intact", () => {
  const raw = "postgresql://user:pass@localhost:5433/db?schema=public&sslmode=require";
  const cleaned = svc.sanitizeDatabaseUrlForPgDump(raw);
  assert.ok(!cleaned.includes("schema="));
  assert.ok(cleaned.includes("sslmode=require"));
});

test("sanitizeDatabaseUrlForPgDump is a no-op when there is no schema param", () => {
  const raw = "postgresql://user:pass@localhost:5433/db";
  assert.equal(svc.sanitizeDatabaseUrlForPgDump(raw), raw);
});

test("isSafePublicTableNameForRowCount only accepts snake_case identifiers", () => {
  assert.equal(svc.isSafePublicTableNameForRowCount("users"), true);
  assert.equal(svc.isSafePublicTableNameForRowCount("user_vault"), true);
  assert.equal(svc.isSafePublicTableNameForRowCount("users; DROP TABLE users;--"), false);
  assert.equal(svc.isSafePublicTableNameForRowCount("Users"), false); // must be lowercase
  assert.equal(svc.isSafePublicTableNameForRowCount("1users"), false); // must start with a letter
  assert.equal(svc.isSafePublicTableNameForRowCount(""), false);
  assert.equal(svc.isSafePublicTableNameForRowCount(null), false);
});

test("CRITICAL_PUBLIC_TABLES matches the money/machine tables that exist in current's schema", () => {
  assert.deepEqual(svc.CRITICAL_PUBLIC_TABLES, [
    "users",
    "transactions",
    "user_vault",
    "user_owned_machines",
    "miners",
    "internal_offerwall_offers",
  ]);
});

test("getAdminBackupsDirectory respects BACKUP_DIR override", () => {
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = "/tmp/some-custom-backups-dir";
    assert.equal(svc.getAdminBackupsDirectory(), "/tmp/some-custom-backups-dir");
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
  }
});

test("resolveBackupDownloadPath rejects invalid filenames without touching disk", async () => {
  await assert.rejects(() => svc.resolveBackupDownloadPath("../../etc/passwd"), /Invalid backup filename/);
  await assert.rejects(() => svc.resolveBackupDownloadPath("not-a-backup.sql"), /Invalid backup filename/);
});

test("resolveBackupDownloadPath: 404s for a missing (but well-formed) filename, and resolves a real file inside BACKUP_DIR", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-backups-test-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;
    await assert.rejects(() => svc.resolveBackupDownloadPath("backup-does-not-exist.sql"), /Backup file not found/);

    const filename = "backup-2026-01-01T00-00-00-000Z.sql";
    await fs.writeFile(path.join(tmpDir, filename), "-- fake dump\n");
    const resolved = await svc.resolveBackupDownloadPath(filename);
    assert.equal(resolved, path.join(tmpDir, filename));
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("resolveBackupDownloadPath: path-traversal guard blocks escaping BACKUP_DIR via crafted relative segments", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-backups-test-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;
    // safeBackupSqlName already blocks "/" and "..", so this exercises the
    // filename-validation gate directly (the realpath check is defense in depth).
    await assert.rejects(() => svc.resolveBackupDownloadPath("backup-..%2f..%2fetc.sql"), /Invalid backup filename/);
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("collectPublicTableExactRowCounts refuses invalid table names before issuing raw SQL", async () => {
  const fakePrisma = { $queryRaw: async () => [{ c: 0n }] };
  await assert.rejects(
    () => svc.collectPublicTableExactRowCounts(fakePrisma, ["users; DROP TABLE users;--"]),
    /Refusing row count on invalid table name/,
  );
});
