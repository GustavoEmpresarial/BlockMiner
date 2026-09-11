/**
 * Single Prisma Client instance for the whole process. No module may
 * instantiate its own PrismaClient — always import this singleton.
 *
 * Ported from legacy/backend/src/shared/prisma/client.ts (the real
 * pg-adapter construction), without the ESM `_server_vendor` shim: this
 * tree has one clean backend, so the file lives directly in core/.
 */
import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { logger } from "../logger/index.js";

const dbLogger = logger.child("Prisma");

const connectionString = process.env.DATABASE_URL;

// GUARD-RAIL: `current/` is an in-progress rewrite, not yet the deployed backend.
// Nothing here may ever touch the production database by accident — a missing
// or misconfigured .env must fail loudly, not silently connect to prod.
// Known production identifiers (VPS host/IP, prod DB name). Update this list if
// production infra changes; never remove it to "make it work" — fix the env instead.
const PRODUCTION_MARKERS = ["89.167.119.164", "169.58.45.155", "blockminer.space"];

function assertNotProductionDatabase(url: string | undefined): void {
  if (!url) {
    throw new Error(
      "[current/server] DATABASE_URL is not set. Copy current/.env.example to current/.env " +
        "and point it at a local/dev Postgres — this tree must never default to production."
    );
  }
  const hit = PRODUCTION_MARKERS.find((marker) => url.includes(marker));
  if (hit) {
    throw new Error(
      `[current/server] Refusing to start: DATABASE_URL contains a known production identifier ("${hit}"). ` +
        "current/ is an unreleased rewrite — it must only ever run against a local/dev/staging database. " +
        "If this is a legitimate staging host that happens to share a substring, adjust PRODUCTION_MARKERS " +
        "in server/core/database/prisma.ts deliberately, don't just delete the check."
    );
  }
}

assertNotProductionDatabase(connectionString);

function poolMaxConnections(): number {
  const n = Number.parseInt(String(process.env.PG_POOL_MAX || "20").trim(), 10);
  if (Number.isFinite(n) && n >= 2) return Math.min(n, 100);
  return 20;
}

// Server-side safety net against connection-pool saturation cascades: a single slow or
// runaway query can otherwise hold a pooled connection indefinitely. statement_timeout
// lets Postgres kill any query past the budget and RETURN the connection to the pool.
const statementTimeoutMs =
  Number.parseInt(String(process.env.PG_STATEMENT_TIMEOUT_MS || "30000").trim(), 10) || 30000;
const idleInTxTimeoutMs =
  Number.parseInt(String(process.env.PG_IDLE_IN_TX_TIMEOUT_MS || "30000").trim(), 10) || 30000;

const pool = new pg.Pool({
  connectionString,
  max: poolMaxConnections(),
  idleTimeoutMillis: Number.parseInt(String(process.env.PG_POOL_IDLE_MS || "30000").trim(), 10) || 30000,
  connectionTimeoutMillis:
    Number.parseInt(String(process.env.PG_POOL_CONNECTION_TIMEOUT_MS || "10000").trim(), 10) || 10000,
  statement_timeout: statementTimeoutMs,
  idle_in_transaction_session_timeout: idleInTxTimeoutMs,
});

pool.on("error", (err) => {
  dbLogger.error("Idle pg pool client error", { error: err instanceof Error ? err.message : String(err) });
});

const adapter = new PrismaPg(pool);

const basePrisma = new PrismaClient({
  adapter,
  // Prisma's defaults are maxWait 2s / timeout 5s — too short under a burst.
  transactionOptions: {
    maxWait: Number.parseInt(String(process.env.PRISMA_TX_MAX_WAIT_MS || "10000").trim(), 10) || 10000,
    timeout: Number.parseInt(String(process.env.PRISMA_TX_TIMEOUT_MS || "15000").trim(), 10) || 15000,
  },
});

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const start = process.hrtime.bigint();
        const result = await query(args);
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        if (durationMs > 1000) {
          dbLogger.warn("Slow query", { model, operation, durationMs: Math.round(durationMs) });
        }
        return result;
      },
    },
  },
});

/** Transaction-client type matching this project's `$extends`-wrapped singleton —
 *  use this (not `Prisma.TransactionClient`) whenever a repository function accepts
 *  the `tx` handle from `prisma.$transaction(async (tx) => ...)`. */
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Full client type of the extended singleton — use instead of bare `PrismaClient`. */
export type AppPrisma = typeof prisma;

export default prisma;
