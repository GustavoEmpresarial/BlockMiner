/** Miner's Contract: signed only with every clause stamped, for the current version, once. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const rows = new Map();
const k = (w) => `${w.userId_termsVersion.userId}:${w.userId_termsVersion.termsVersion}`;
mock.module(pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href, {
  defaultExport: {
    userTermsAcceptance: {
      findUnique: async ({ where }) => rows.get(k(where)) ?? null,
      upsert: async ({ where, create }) => {
        if (!rows.has(k(where))) rows.set(k(where), { ...create, acceptedAt: new Date("2026-10-19T18:00:00Z") });
        return rows.get(k(where));
      },
    },
  },
});
const c = await import("../../server/modules/terms/terms.contract.ts");
const all = [...c.TERMS_CONTRACT_CLAUSES];

test("unsigned by default; lists the clauses and the version", async () => {
  const s = await c.getContractStatus(7);
  assert.equal(s.signed, false);
  assert.equal(s.version, c.TERMS_CONTRACT_VERSION);
  assert.deepEqual(s.clauses, all);
  assert.equal(s.certificate, null);
});

test("refuses a stale version or missing stamps", async () => {
  await assert.rejects(c.signContract(7, { version: "2020-01-01", stamped: all }), (e) => e.code === "TERMS_VERSION_MISMATCH" && e.status === 409);
  await assert.rejects(c.signContract(7, { version: c.TERMS_CONTRACT_VERSION, stamped: all.slice(1) }), (e) => e.code === "TERMS_CLAUSES_INCOMPLETE");
  await assert.rejects(c.signContract(7, { version: c.TERMS_CONTRACT_VERSION, stamped: "age" }), (e) => e.code === "TERMS_CLAUSES_INCOMPLETE");
  assert.equal((await c.getContractStatus(7)).signed, false);
});

test("signs with all stamps; second signature keeps the first time; certificate number", async () => {
  const s = await c.signContract(7, { version: c.TERMS_CONTRACT_VERSION, stamped: [...all, "extra"] });
  assert.equal(s.signed, true);
  assert.equal(s.signedAt, "2026-10-19T18:00:00.000Z");
  assert.equal(s.certificate, `BM-000007-${c.TERMS_CONTRACT_VERSION.replace(/-/g, "")}`);
  const again = await c.signContract(7, { version: c.TERMS_CONTRACT_VERSION, stamped: all });
  assert.equal(again.signedAt, s.signedAt);
  assert.equal(rows.get(`7:${c.TERMS_CONTRACT_VERSION}`).clauseCount, all.length);
});
