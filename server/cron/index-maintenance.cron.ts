/**
 * Index maintenance cron. Retention deletes millions of rows from event_outbox / notifications and
 * their btree indexes never shrink back: event_outbox reached 2.8 GB of index for ~270 MB of need,
 * notifications 525 MB for 342 rows (both rebuilt by hand on 2026-10-19). This rebuilds them with
 * REINDEX CONCURRENTLY (no write lock) in a quiet hour, at most once a day per table, only when the
 * index is clearly bloated.
 *
 * Runs on its own pg connection: session settings (lock_timeout, statement_timeout=0) must not leak
 * into the shared pool, and REINDEX CONCURRENTLY cannot run inside a transaction.
 */
import pg from "pg";
import { logger } from "../core/logger/index.js";

const log = logger.child("IndexMaintenanceCron");

const DEFAULT_TABLES = ["event_outbox", "notifications"];
const MIN_INDEX_BYTES = 64 * 2 ** 20;
/** Healthy indexes measured 15-60 B per row per index; event_outbox bloated sat at ~328. */
const MAX_BYTES_PER_ROW_PER_INDEX = 150;

type Log = { info: (m: string, d?: Record<string, unknown>) => void; warn: (m: string, d?: Record<string, unknown>) => void };
type Client = { connect: () => Promise<void>; end: () => Promise<void>; query: (q: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export function isIndexBloated(s: { indexBytes: number; liveRows: number; indexCount: number }): boolean {
  if (s.indexBytes < MIN_INDEX_BYTES) return false;
  const perRow = s.indexBytes / Math.max(1, s.liveRows) / Math.max(1, s.indexCount);
  return perRow > MAX_BYTES_PER_ROW_PER_INDEX;
}

/** Only plain lowercase identifiers: the name is interpolated into DDL. */
export function parseMaintenanceTables(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [...DEFAULT_TABLES];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => /^[a-z_][a-z0-9_]{0,62}$/.test(t));
}

export async function runIndexMaintenance(opts: {
  now: Date;
  hourUtc: number;
  tables: string[];
  /** table -> UTC day key of the last check; once a day per table. */
  state: Map<string, string>;
  newClient: () => Client;
  log: Log;
}): Promise<{ reindexed: string[] }> {
  const reindexed: string[] = [];
  if (opts.now.getUTCHours() !== opts.hourUtc) return { reindexed };
  const day = opts.now.toISOString().slice(0, 10);
  const due = opts.tables.filter((t) => opts.state.get(t) !== day);
  if (due.length === 0) return { reindexed };

  const client = opts.newClient();
  await client.connect();
  try {
    await client.query("SET statement_timeout = 0");
    await client.query("SET lock_timeout = '10s'");
    for (const table of due) {
      opts.state.set(table, day);
      // A REINDEX CONCURRENTLY cut short (restart, lock timeout) leaves an invalid *_ccnew index.
      const invalid = await client.query(
        `select c.relname as name from pg_index x join pg_class c on c.oid = x.indexrelid
         join pg_class t on t.oid = x.indrelid where t.relname = $1 and not x.indisvalid`,
        [table],
      );
      for (const row of invalid.rows) {
        const name = String(row.name);
        if (!/^[a-z0-9_]+_ccnew[0-9]*$/.test(name)) continue;
        await client.query(`DROP INDEX CONCURRENTLY IF EXISTS "${name}"`);
        opts.log.warn("INDEX_INVALID_LEFTOVER_DROPPED", { table, index: name });
      }

      const stat = await client.query(
        `select pg_indexes_size(c.oid) as index_bytes, greatest(c.reltuples, 0)::bigint as live_rows,
                (select count(*) from pg_index x where x.indrelid = c.oid)::int as index_count
         from pg_class c where c.relname = $1 and c.relkind = 'r'`,
        [table],
      );
      const r = stat.rows[0];
      if (!r) continue;
      const s = { indexBytes: Number(r.index_bytes), liveRows: Number(r.live_rows), indexCount: Number(r.index_count) };
      if (!isIndexBloated(s)) continue;

      const started = Date.now();
      try {
        await client.query(`REINDEX TABLE CONCURRENTLY "${table}"`);
        const after = await client.query(`select pg_indexes_size($1::regclass) as b`, [table]);
        reindexed.push(table);
        opts.log.info("index_maintenance.reindexed", {
          table,
          beforeMb: Math.round(s.indexBytes / 2 ** 20),
          afterMb: Math.round(Number(after.rows[0]?.b ?? 0) / 2 ** 20),
          durationMs: Date.now() - started,
        });
      } catch (err) {
        const e = err as { code?: string; message?: string };
        opts.log.warn("INDEX_REINDEX_FAILED", { table, errorCode: e?.code ?? "unknown", durationMs: Date.now() - started });
      }
    }
  } finally {
    await client.end().catch(() => undefined);
  }
  return { reindexed };
}

export function startIndexMaintenanceCron(): { stop: () => void } {
  const hourUtc = Math.min(23, Math.max(0, Number(process.env.INDEX_MAINTENANCE_HOUR_UTC ?? 5)));
  const tables = parseMaintenanceTables(process.env.INDEX_MAINTENANCE_TABLES);
  const state = new Map<string, string>();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runIndexMaintenance({
        now: new Date(),
        hourUtc,
        tables,
        state,
        newClient: () => new pg.Client({ connectionString: process.env.DATABASE_URL }) as unknown as Client,
        log,
      });
    } catch (err) {
      log.warn("INDEX_MAINTENANCE_FAILED", { errorCode: (err as { code?: string })?.code ?? "unknown" });
    } finally {
      running = false;
    }
  };
  const handle = setInterval(() => void tick(), 10 * 60_000);
  handle.unref?.();
  log.info("Index maintenance cron started", { hourUtc, tables });
  return { stop: () => clearInterval(handle) };
}
