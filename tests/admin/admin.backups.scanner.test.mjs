/**
 * Unit: the plain-dump scanner that sits between pg_dump and gzip during a backup.
 * It must report exactly what a line-by-line scan reports, whatever the chunk boundaries,
 * and must not walk bytes in JS (it runs on the app's event loop for the whole backup).
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

const { createPlainDumpScanner, CRITICAL_PUBLIC_TABLES } = await import(
  "../../server/modules/admin/admin.backups.service.ts"
);

/** Reference: the previous behaviour, one decoded string per line. */
function referenceScan(text, criticalTables) {
  const state = { headerOk: false, footerOk: false, copyPublicLineCount: 0, found: new Set() };
  for (const line of text.split("\n")) {
    if (!state.headerOk && line.includes("PostgreSQL database dump")) state.headerOk = true;
    if (line.includes("PostgreSQL database dump complete")) state.footerOk = true;
    if (line.startsWith("COPY public.")) {
      state.copyPublicLineCount += 1;
      for (const t of criticalTables) {
        if (line.startsWith(`COPY public.${t} `) || line.startsWith(`COPY public.${t}\t`)) state.found.add(t);
      }
    }
  }
  return state;
}

async function runScanner(buf, chunkSize, criticalTables = CRITICAL_PUBLIC_TABLES) {
  const chunks = [];
  for (let i = 0; i < buf.length; i += chunkSize) chunks.push(buf.subarray(i, i + chunkSize));
  const scanner = createPlainDumpScanner(criticalTables);
  let passed = 0;
  await pipeline(
    Readable.from(chunks),
    scanner.transform,
    new Writable({
      write(c, _e, cb) {
        passed += c.length;
        cb();
      },
    }),
  );
  return { scan: scanner.finish(), passed };
}

function sampleDump({ footer = true } = {}) {
  const parts = ["--\n-- PostgreSQL database dump\n--\n\nSET statement_timeout = 0;\n"];
  for (const t of CRITICAL_PUBLIC_TABLES) {
    parts.push(`COPY public.${t} (id, name) FROM stdin;\n`);
    for (let i = 0; i < 50; i++) parts.push(`${i}\trow ${i} of ${t} ção\n`);
    parts.push("\\.\n\n");
  }
  // Markers inside data must not count as a COPY section.
  parts.push("COPY public.notes (id, body) FROM stdin;\n1\tsee COPY public.users here\n2\tCOPY public.miners\n\\.\n");
  parts.push("COPY public.users_archive (id) FROM stdin;\n\\.\n");
  if (footer) parts.push("\n--\n-- PostgreSQL database dump complete\n--\n\n");
  return Buffer.from(parts.join(""), "utf8");
}

test("matches the line-by-line scan for every chunk size, including 1-byte chunks", async () => {
  const buf = sampleDump();
  const ref = referenceScan(buf.toString("utf8"), CRITICAL_PUBLIC_TABLES);
  for (const size of [1, 2, 3, 7, 13, 64, 1000, buf.length]) {
    const { scan, passed } = await runScanner(buf, size);
    assert.equal(passed, buf.length, `pass-through intact at chunk ${size}`);
    assert.equal(scan.plainBytes, buf.length);
    assert.equal(scan.headerOk, ref.headerOk, `header @${size}`);
    assert.equal(scan.footerOk, ref.footerOk, `footer @${size}`);
    assert.equal(scan.copyPublicLineCount, ref.copyPublicLineCount, `copy count @${size}`);
    assert.deepEqual([...scan.found].sort(), [...ref.found].sort(), `tables @${size}`);
    assert.equal(scan.sha256, crypto.createHash("sha256").update(buf).digest("hex"));
  }
  assert.equal(ref.copyPublicLineCount, CRITICAL_PUBLIC_TABLES.length + 2);
  assert.equal(ref.found.size, CRITICAL_PUBLIC_TABLES.length);
});

test("a truncated dump (no footer) and a dump missing a critical table are both reported", async () => {
  const { scan } = await runScanner(sampleDump({ footer: false }), 17);
  assert.equal(scan.headerOk, true);
  assert.equal(scan.footerOk, false);

  const noMiners = Buffer.from(sampleDump().toString("utf8").replace("COPY public.miners (", "COPY public.minerz ("), "utf8");
  const r = await runScanner(noMiners, 29);
  assert.equal(r.scan.found.has("miners"), false, "COPY public.miners inside a data row must not count");
});

test("last line without trailing newline is still scanned", async () => {
  const buf = Buffer.from("-- PostgreSQL database dump\nCOPY public.users (id) FROM stdin;", "utf8");
  const { scan } = await runScanner(buf, 5, ["users"]);
  assert.equal(scan.copyPublicLineCount, 1);
  assert.ok(scan.found.has("users"));
});

test("throughput: 128 MB of row data in 64 KB chunks scans far faster than the JS byte loop", async () => {
  const row = Buffer.from("123456\tsome user row with text and numbers 0.12345678\t2026-10-16 00:00:00+00\n");
  const block = Buffer.concat(Array.from({ length: Math.ceil((64 * 1024) / row.length) }, () => row));
  const head = Buffer.from("-- PostgreSQL database dump\nCOPY public.users (id) FROM stdin;\n");
  const blocks = [head, ...Array.from({ length: 2048 }, () => block)];
  const total = blocks.reduce((a, b) => a + b.length, 0);

  const scanner = createPlainDumpScanner(["users"]);
  const t0 = process.hrtime.bigint();
  await pipeline(Readable.from(blocks), scanner.transform, new Writable({ write: (_c, _e, cb) => cb() }));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const scan = scanner.finish();
  assert.equal(scan.plainBytes, total);
  assert.ok(scan.found.has("users"));
  const mbps = total / 1024 / 1024 / (ms / 1000);
  console.log(`# scanner: ${(total / 1024 / 1024).toFixed(0)} MB in ${ms.toFixed(0)} ms = ${mbps.toFixed(0)} MB/s`);
  assert.ok(mbps > 300, `expected > 300 MB/s, got ${mbps.toFixed(0)} MB/s`);
});
