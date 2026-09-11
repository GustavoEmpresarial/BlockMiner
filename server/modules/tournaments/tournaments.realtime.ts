/**
 * Tournament realtime ranking. Emits `tournament:update` to a per-tournament Socket.IO room
 * whenever a score changes. Uses a dirty-set coalescing flush so a burst of contributions
 * within a short window produces a single emit (low CPU, no emit storms).
 *
 * The leaderboard slice is a BOUNDED query (top 100, indexed) — never a full recalculation.
 * Ported from legacy/server/services/tournamentRealtime.ts.
 */
import { Redis } from "ioredis";
import type { Server } from "socket.io";
import prisma from "../../core/database/prisma.js";
import { logger as rootLogger } from "../../core/logger/index.js";
import { getRedis, getRedisUrl } from "../../core/redis/index.js";

const logger = rootLogger.child("TournamentRealtime");

let ioRef: Server | null = null;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Cross-process dirty bridge ─────────────────────────────────────────────
// Score changes are frequently computed by a worker process with no Socket.IO server
// (ioRef stays null there), so a plain markTournamentDirty() call there would do nothing.
// Publish over Redis so the app process (the one holding live socket connections) picks it up.
const DIRTY_CHANNEL = "tournament:dirty:v1";
let subscriber: Redis | null = null;

function publishDirty(tournamentId: number): void {
  const redis = getRedis();
  if (!redis) return;
  redis.publish(DIRTY_CHANNEL, String(tournamentId)).catch((err: unknown) => {
    logger.warn("tournament.realtime.publish_failed", { tournamentId, error: errMsg(err) });
  });
}

/** Mark dirty in-process AND notify other processes over Redis. Called by the tournament engine. */
export function notifyTournamentDirty(tournamentId: number): void {
  markTournamentDirty(tournamentId);
  publishDirty(tournamentId);
}

/** App process only: receive dirty notifications published by other processes. */
function subscribeDirtyBridge(): void {
  const url = getRedisUrl();
  if (!url || subscriber) return;
  subscriber = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
  subscriber.on("error", (err: Error) => {
    logger.warn("tournament.realtime.subscriber_error", { message: err.message });
  });
  subscriber.subscribe(DIRTY_CHANNEL).catch((err: unknown) => {
    logger.warn("tournament.realtime.subscribe_failed", { error: errMsg(err) });
  });
  subscriber.on("message", (channel: string, message: string) => {
    if (channel !== DIRTY_CHANNEL) return;
    const tournamentId = Number(message);
    if (!Number.isFinite(tournamentId) || tournamentId <= 0) return;
    markTournamentDirty(tournamentId);
  });
}

const LEADERBOARD_LIMIT = 100;
const FLUSH_INTERVAL_MS = Number(process.env.TOURNAMENT_REALTIME_FLUSH_MS || 1500);
const roomName = (tournamentId: number) => `tournament:${tournamentId}`;

// ─── Dirty-set coalescing ────────────────────────────────────────────────────
const dirty = new Set<number>();
let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushDirty();
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
}

async function flushDirty(): Promise<void> {
  if (dirty.size === 0) return;
  const batch = Array.from(dirty);
  dirty.clear();
  for (const tournamentId of batch) {
    try {
      await emitTournamentUpdateNow(tournamentId);
    } catch (err) {
      logger.warn("tournament.realtime.flush_failed", { tournamentId, error: errMsg(err) });
    }
  }
}

/** Mark a tournament's leaderboard as changed; it will be emitted on the next flush. */
export function markTournamentDirty(tournamentId: number): void {
  if (!ioRef) return;
  dirty.add(tournamentId);
  ensureFlushTimer();
}

/** Bounded top-N leaderboard slice (indexed query, never a full recalculation). */
export async function buildLeaderboardSlice(
  tournamentId: number,
): Promise<{ top: unknown[]; participantCount: number }> {
  const [top, participantCount] = await Promise.all([
    prisma.tournamentEntry.findMany({
      where: { tournamentId },
      orderBy: [{ score: "desc" }, { firstContributionAt: "asc" }],
      take: LEADERBOARD_LIMIT,
      include: { user: { select: { id: true, username: true, name: true } } },
    }),
    prisma.tournamentEntry.count({ where: { tournamentId } }),
  ]);
  return { top, participantCount };
}

/** Emit a `tournament:update` immediately (bypasses the dirty coalescing). */
export async function emitTournamentUpdateNow(tournamentId: number): Promise<void> {
  if (!ioRef) return;
  const t0 = Date.now();
  try {
    const { top, participantCount } = await buildLeaderboardSlice(tournamentId);
    const payload = { tournamentId, top, participantCount, timestamp: Date.now() };
    ioRef.to(roomName(tournamentId)).emit("tournament:update", payload);
    logger.info("tournament.realtime.emitted", {
      tournamentId,
      participants: participantCount,
      topCount: Array.isArray(top) ? top.length : 0,
      elapsedMs: Date.now() - t0,
    });
  } catch (err) {
    logger.warn("tournament.realtime.emit_failed", { tournamentId, error: errMsg(err) });
  }
}

// ─── Socket.IO wiring ────────────────────────────────────────────────────────

/**
 * Stores the Socket.IO server ref and registers room subscribe/unsubscribe handling.
 * Called once from tournaments.socket.ts's `registerTournamentSocketHandlers`.
 */
export function setTournamentIo(io: Server): void {
  ioRef = io;
  subscribeDirtyBridge();
  logger.info("tournament.realtime.io_registered");
}

export function getTournamentIo(): Server | null {
  return ioRef;
}

/** Legacy tournamentScoreHook metric cache — no-op in current/ (no such cache exists here). */
export function invalidateTournamentCache(_metric?: string): void {
  /* intentionally empty */
}
