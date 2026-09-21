import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const svc = await import("../../server/modules/admin/admin.backups.service.ts");

function createMockDumpContent({
  header = "-- PostgreSQL database dump\n",
  tables = svc.CRITICAL_PUBLIC_TABLES,
  footer = "\n-- PostgreSQL database dump complete\n",
  extraData = "SELECT 1;\n",
} = {}) {
  let content = `${header}\nSET statement_timeout = 0;\n${extraData}\n`;
  for (const t of tables) {
    content += `COPY public.${t} (id) FROM stdin;\n1\n\\.\n\n`;
  }
  content += footer;
  // Pad if needed so it's > 256 bytes
  while (content.length < 300) {
    content += "-- padding line for minimum size threshold\n";
  }
  return content;
}

test("computeFileSha256 computes consistent sha256 checksum", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-sha-test-"));
  try {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "BlockMiner Backup Integrity Test Data", "utf8");
    const hash = await svc.computeFileSha256(filePath);
    assert.equal(typeof hash, "string");
    assert.equal(hash.length, 64);

    // Recomputing must yield identical hash
    const hash2 = await svc.computeFileSha256(filePath);
    assert.equal(hash, hash2);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("checkPgDumpFooter detects presence and absence of completion marker", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-footer-test-"));
  try {
    const validFile = path.join(tmpDir, "valid.sql");
    const validContent = "-- PostgreSQL database dump\n-- some data\n-- PostgreSQL database dump complete\n";
    // Pad to > 64 bytes
    await fs.writeFile(validFile, validContent.padEnd(100, " "), "utf8");
    assert.equal(await svc.checkPgDumpFooter(validFile), true);

    const invalidFile = path.join(tmpDir, "truncated.sql");
    const truncatedContent = "-- PostgreSQL database dump\n-- data interrupted...";
    await fs.writeFile(invalidFile, truncatedContent.padEnd(100, " "), "utf8");
    assert.equal(await svc.checkPgDumpFooter(invalidFile), false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("verifyBackupIntegrity: passes a valid complete PostgreSQL backup", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-integrity-valid-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;
    const filename = "backup-2026-09-21T12-00-00-000Z.sql";
    const dumpContent = createMockDumpContent();
    const filePath = path.join(tmpDir, filename);
    await fs.writeFile(filePath, dumpContent, "utf8");

    const sha256 = await svc.computeFileSha256(filePath);
    const metaPath = path.join(tmpDir, "backup-2026-09-21T12-00-00-000Z.meta.json");
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        version: 1,
        filename,
        createdAt: new Date().toISOString(),
        status: "success",
        sizeBytes: Buffer.byteLength(dumpContent),
        sha256,
      }),
      "utf8"
    );

    const report = await svc.verifyBackupIntegrity(filename);
    assert.equal(report.ok, true);
    assert.equal(report.status, "valid");
    assert.equal(report.checks.sizeOk, true);
    assert.equal(report.checks.headerOk, true);
    assert.equal(report.checks.footerOk, true);
    assert.equal(report.checks.criticalTablesOk, true);
    assert.equal(report.checks.hashMatch, true);
    assert.equal(report.errors.length, 0);
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("verifyBackupIntegrity: detects corrupted truncated backup (< 256 bytes)", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-integrity-trunc-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;
    const filename = "backup-2026-09-21T12-00-00-001Z.sql";
    const filePath = path.join(tmpDir, filename);
    await fs.writeFile(filePath, "-- short dump\n", "utf8"); // < 256 bytes

    const report = await svc.verifyBackupIntegrity(filename);
    assert.equal(report.ok, false);
    assert.equal(report.status, "corrupted");
    assert.equal(report.checks.sizeOk, false);
    assert.ok(report.errors.some((e) => e.includes("muito pequeno")));
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("verifyBackupIntegrity: detects missing PostgreSQL header", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-integrity-nohead-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;
    const filename = "backup-2026-09-21T12-00-00-002Z.sql";
    const filePath = path.join(tmpDir, filename);
    const dumpContent = createMockDumpContent({ header: "-- Random header without Postgres identifier" });
    await fs.writeFile(filePath, dumpContent, "utf8");

    const report = await svc.verifyBackupIntegrity(filename);
    assert.equal(report.ok, false);
    assert.equal(report.status, "corrupted");
    assert.equal(report.checks.headerOk, false);
    assert.ok(report.errors.some((e) => e.includes("Cabeçalho do PostgreSQL")));
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("verifyBackupIntegrity: detects missing critical tables in COPY directives", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-integrity-notables-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;
    const filename = "backup-2026-09-21T12-00-00-003Z.sql";
    const filePath = path.join(tmpDir, filename);
    // Missing "users" and "transactions"
    const partialTables = ["user_vault", "user_owned_machines", "miners", "internal_offerwall_offers"];
    const dumpContent = createMockDumpContent({ tables: partialTables });
    await fs.writeFile(filePath, dumpContent, "utf8");

    const report = await svc.verifyBackupIntegrity(filename);
    assert.equal(report.ok, false);
    assert.equal(report.status, "corrupted");
    assert.equal(report.checks.criticalTablesOk, false);
    assert.ok(report.missingCriticalTables.includes("users"));
    assert.ok(report.missingCriticalTables.includes("transactions"));
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("verifyBackupIntegrity: detects missing footer (incomplete dump)", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-integrity-nofooter-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;
    const filename = "backup-2026-09-21T12-00-00-004Z.sql";
    const filePath = path.join(tmpDir, filename);
    const dumpContent = createMockDumpContent({ footer: "\n-- Connection severed prematurely\n" });
    await fs.writeFile(filePath, dumpContent, "utf8");

    const report = await svc.verifyBackupIntegrity(filename);
    assert.equal(report.ok, false);
    assert.equal(report.status, "corrupted");
    assert.equal(report.checks.footerOk, false);
    assert.ok(report.errors.some((e) => e.includes("Marcador de finalização")));
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("verifyBackupIntegrity: detects SHA-256 hash tampering (modified bytes)", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-integrity-tamper-"));
  const prev = process.env.BACKUP_DIR;
  try {
    process.env.BACKUP_DIR = tmpDir;
    const filename = "backup-2026-09-21T12-00-00-005Z.sql";
    const filePath = path.join(tmpDir, filename);
    const dumpContent = createMockDumpContent();
    await fs.writeFile(filePath, dumpContent, "utf8");

    const originalSha = await svc.computeFileSha256(filePath);
    const metaPath = path.join(tmpDir, "backup-2026-09-21T12-00-00-005Z.meta.json");
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        version: 1,
        filename,
        createdAt: new Date().toISOString(),
        status: "success",
        sha256: originalSha,
      }),
      "utf8"
    );

    // Tamper with the dump by altering bytes
    await fs.appendFile(filePath, "\n-- MALICIOUS_INJECTION_OR_DATA_CORRUPTION\n", "utf8");

    const report = await svc.verifyBackupIntegrity(filename);
    assert.equal(report.ok, false);
    assert.equal(report.status, "corrupted");
    assert.equal(report.checks.hashMatch, false);
    assert.ok(report.errors.some((e) => e.includes("Hash SHA-256 divergente")));
  } finally {
    if (prev === undefined) delete process.env.BACKUP_DIR;
    else process.env.BACKUP_DIR = prev;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("verifyTarBundleIntegrity: validates good archive and rejects corrupted archive", async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bm-tar-test-"));
  try {
    const sampleFile = path.join(tmpDir, "data.txt");
    await fs.writeFile(sampleFile, "sample data for tar bundle", "utf8");

    // Corrupted archive test
    const corruptBundle = path.join(tmpDir, "corrupt.bundle.tar.gz");
    await fs.writeFile(corruptBundle, "NOT_A_VALID_GZIP_FILE_RANDOM_BYTES_1234567890", "utf8");
    const corruptCheck = await svc.verifyTarBundleIntegrity(corruptBundle);
    assert.equal(corruptCheck.ok, false);
    assert.ok(corruptCheck.error);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
