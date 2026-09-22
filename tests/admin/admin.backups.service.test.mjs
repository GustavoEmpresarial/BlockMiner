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


test("collectPublicTableExactRowCounts refuses invalid table names before issuing raw SQL", async () => {
  const fakePrisma = { $queryRaw: async () => [{ c: 0n }] };
  await assert.rejects(
    () => svc.collectPublicTableExactRowCounts(fakePrisma, ["users; DROP TABLE users;--"]),
    /Refusing row count on invalid table name/,
  );
});
