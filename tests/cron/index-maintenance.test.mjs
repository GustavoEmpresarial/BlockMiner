/**
 * Index maintenance: event_outbox / notifications indexes bloat under retention churn
 * (event_outbox reached 2.8 GB of index for 268 MB of need; notifications 525 MB for 342 rows).
 * The cron rebuilds them CONCURRENTLY, in a quiet hour, at most once a day per table.
 */
import test from "node:test";
import assert from "node:assert/strict";

const m = await import("../../server/cron/index-maintenance.cron.ts");

test("bloat decision: healthy indexes are left alone, bloated ones are rebuilt", () => {
  // event_outbox before: 2786 MB, 2.96M rows, 3 indexes -> ~328 B/row/idx
  assert.equal(m.isIndexBloated({ indexBytes: 2786 * 2 ** 20, liveRows: 2_962_867, indexCount: 3 }), true);
  // notifications before: 525 MB for 342 rows
  assert.equal(m.isIndexBloated({ indexBytes: 525 * 2 ** 20, liveRows: 342, indexCount: 5 }), true);
  // event_outbox after reindex: 268 MB -> ~32 B/row/idx
  assert.equal(m.isIndexBloated({ indexBytes: 268 * 2 ** 20, liveRows: 2_962_867, indexCount: 3 }), false);
  // tiny table, tiny index: never worth it
  assert.equal(m.isIndexBloated({ indexBytes: 10 * 2 ** 20, liveRows: 1, indexCount: 2 }), false);
});

test("table names are whitelisted identifiers only", () => {
  assert.deepEqual(m.parseMaintenanceTables(undefined), ["event_outbox", "notifications"]);
  assert.deepEqual(m.parseMaintenanceTables("event_outbox, tournament_domain_outbox"), ["event_outbox", "tournament_domain_outbox"]);
  assert.deepEqual(m.parseMaintenanceTables("users; drop table x,ok_table,\"q\""), ["ok_table"]);
});

function fakeClient(stats) {
  const sql = [];
  return {
    sql,
    connect: async () => {},
    end: async () => {},
    query: async (q, params) => {
      sql.push(q.trim().split(/\s+/).slice(0, 4).join(" "));
      if (/from pg_index x join pg_class/i.test(q)) return { rows: stats.invalid ?? [] };
      if (/pg_indexes_size/i.test(q)) return { rows: [{ index_bytes: String(stats.indexBytes), live_rows: stats.liveRows, index_count: stats.indexCount }] };
      return { rows: [] };
    },
  };
}

const quiet = { info() {}, warn() {}, error() {} };

test("runs only in the configured UTC hour and once per day per table", async () => {
  const state = new Map();
  const mk = () => fakeClient({ indexBytes: 2786 * 2 ** 20, liveRows: 2_962_867, indexCount: 3 });
  let c = mk();
  await m.runIndexMaintenance({ now: new Date("2026-10-20T04:30:00Z"), hourUtc: 5, tables: ["event_outbox"], state, newClient: () => c, log: quiet });
  assert.equal(c.sql.length, 0, "outside the window nothing touches the DB");

  c = mk();
  const r1 = await m.runIndexMaintenance({ now: new Date("2026-10-20T05:10:00Z"), hourUtc: 5, tables: ["event_outbox"], state, newClient: () => c, log: quiet });
  assert.deepEqual(r1.reindexed, ["event_outbox"]);
  assert.ok(c.sql.some((s) => /^REINDEX TABLE CONCURRENTLY/i.test(s)), JSON.stringify(c.sql));
  assert.ok(c.sql.some((s) => /^SET lock_timeout/i.test(s)));

  c = mk();
  const r2 = await m.runIndexMaintenance({ now: new Date("2026-10-20T05:50:00Z"), hourUtc: 5, tables: ["event_outbox"], state, newClient: () => c, log: quiet });
  assert.deepEqual(r2.reindexed, []);
  assert.equal(c.sql.length, 0);
});

test("healthy table: checked, not rebuilt; leftover invalid _ccnew index is dropped and reported", async () => {
  const warns = [];
  const c = fakeClient({ indexBytes: 268 * 2 ** 20, liveRows: 2_962_867, indexCount: 3, invalid: [{ name: "event_outbox_pkey_ccnew" }] });
  const r = await m.runIndexMaintenance({
    now: new Date("2026-10-21T05:05:00Z"), hourUtc: 5, tables: ["event_outbox"], state: new Map(), newClient: () => c,
    log: { ...quiet, warn: (msg, d) => warns.push({ msg, d }) },
  });
  assert.deepEqual(r.reindexed, []);
  assert.ok(!c.sql.some((s) => /^REINDEX/i.test(s)));
  assert.ok(c.sql.some((s) => /^DROP INDEX CONCURRENTLY/i.test(s)));
  assert.equal(warns[0].msg, "INDEX_INVALID_LEFTOVER_DROPPED");
});
