import prisma from "../../core/database/prisma.js";
import { isTournamentIncrementalScoringEnabled } from "./tournaments.flags.js";
import { registerTournamentMetricScorers, getMetricScorer } from "./tournaments.scorers.js";
import { notifyTournamentDirty } from "./tournaments.realtime.js";
import { invalidateLeaderboardCache } from "./tournaments.cache.js";
import { computeDepositScores } from "./deposit-score.js";
import {
  aggregateUserHashrates,
  loadUsersForHashrateTournament,
} from "./ranking.hashrate.js";
import { isAutoMiningV2SchemaAvailable } from "../auto-mining/index.js";

type Tournament = {
  id: number;
  name: string;
  metric: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  prizes?: unknown[];
};

/**
 * `reachedAt` (when known) is stored in firstContributionAt, which every
 * leaderboard sorts on after score: on a tie, whoever reached the score first
 * ranks higher.
 */
export async function batchUpsertEntries(
  tournamentId: number,
  rows: { userId: number; score: number; reachedAt?: Date | null }[],
): Promise<void> {
  // Entries that already received a prize are history — never rewrite or drop them.
  const unpaid = { rewardGranted: false } as const;
  const active = rows.filter((r) => r.score > 0);
  const activeIds = active.map((r) => r.userId);

  if (activeIds.length === 0) {
    await prisma.tournamentEntry.deleteMany({ where: { tournamentId, ...unpaid } });
    await invalidateLeaderboardCache(tournamentId);
    notifyTournamentDirty(tournamentId);
    return;
  }

  await prisma.tournamentEntry.deleteMany({
    where: { tournamentId, userId: { notIn: activeIds }, ...unpaid },
  });

  // Rows that carry reachedAt rewrite the tie-break; rows that don't must leave it alone, so the
  // two kinds go in separate statements (EXCLUDED cannot tell "set to null" from "not given").
  const withTieBreak = active.filter((r) => r.reachedAt !== undefined);
  const scoreOnly = active.filter((r) => r.reachedAt === undefined);
  for (let i = 0; i < withTieBreak.length; i += UPSERT_CHUNK) {
    await upsertEntriesChunk(tournamentId, withTieBreak.slice(i, i + UPSERT_CHUNK), true);
  }
  for (let i = 0; i < scoreOnly.length; i += UPSERT_CHUNK) {
    await upsertEntriesChunk(tournamentId, scoreOnly.slice(i, i + UPSERT_CHUNK), false);
  }

  await invalidateLeaderboardCache(tournamentId);
  notifyTournamentDirty(tournamentId);
}

/** Rows per statement. One statement replaces what used to be one UPDATE (+ maybe INSERT) per user. */
const UPSERT_CHUNK = 1000;

/**
 * Single-statement upsert. Same rules as the old per-row updateMany/createMany pair:
 * a paid entry (reward_granted) is never touched, and an unchanged row is not rewritten,
 * so a scoring tick with no movement costs one round trip instead of one per participant.
 */
async function upsertEntriesChunk(
  tournamentId: number,
  rows: { userId: number; score: number; reachedAt?: Date | null }[],
  setTieBreak: boolean,
): Promise<void> {
  if (rows.length === 0) return;
  const userIds = rows.map((r) => r.userId);
  const scores = rows.map((r) => r.score);
  if (setTieBreak) {
    const reached = rows.map((r) => (r.reachedAt ? r.reachedAt.toISOString() : null));
    await prisma.$executeRaw`
      INSERT INTO tournament_entries AS te (tournament_id, user_id, score, first_contribution_at, updated_at)
      SELECT ${tournamentId}, t.user_id, t.score, t.reached::timestamptz AT TIME ZONE 'UTC', now()
      FROM unnest(${userIds}::int[], ${scores}::float8[], ${reached}::text[]) AS t(user_id, score, reached)
      ON CONFLICT (tournament_id, user_id) DO UPDATE
        SET score = EXCLUDED.score, first_contribution_at = EXCLUDED.first_contribution_at, updated_at = now()
        WHERE te.reward_granted = false
          AND (te.score IS DISTINCT FROM EXCLUDED.score
               OR te.first_contribution_at IS DISTINCT FROM EXCLUDED.first_contribution_at)`;
    return;
  }
  await prisma.$executeRaw`
    INSERT INTO tournament_entries AS te (tournament_id, user_id, score, updated_at)
    SELECT ${tournamentId}, t.user_id, t.score, now()
    FROM unnest(${userIds}::int[], ${scores}::float8[]) AS t(user_id, score)
    ON CONFLICT (tournament_id, user_id) DO UPDATE
      SET score = EXCLUDED.score, updated_at = now()
      WHERE te.reward_granted = false AND te.score IS DISTINCT FROM EXCLUDED.score`;
}

export async function computeScoresForTournament(tournament: Tournament): Promise<void> {
  const now = new Date();
  const upperBound = tournament.endsAt < now ? tournament.endsAt : now;
  const { metric, startsAt } = tournament;

  if (metric === "HASHRATE") {
    const v2Ok = await isAutoMiningV2SchemaAvailable();
    const users = await loadUsersForHashrateTournament(now, v2Ok);
    const updates: { userId: number; score: number }[] = users
      .map((u) => ({ userId: u.id as number, score: aggregateUserHashrates(u).totalHashrate }))
      .filter((r) => r.score > 0);
    await batchUpsertEntries(tournament.id, updates);
    return;
  }

  if (metric === "BLOCKS_MINED") {
    const rows = await prisma.blockMinerReward.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: startsAt, lte: upperBound } },
      _count: { id: true },
    });
    await batchUpsertEntries(
      tournament.id,
      rows.map((r) => ({ userId: r.userId, score: r._count.id })),
    );
    return;
  }

  if (metric === "CHECKINS") {
    const rows = await prisma.dailyCheckin.groupBy({
      by: ["userId"],
      where: {
        OR: [
          { confirmedAt: { gte: startsAt, lte: upperBound } },
          { createdAt: { gte: startsAt, lte: upperBound }, status: "confirmed" },
        ],
      },
      _count: { id: true },
    });
    await batchUpsertEntries(
      tournament.id,
      rows.map((r) => ({ userId: r.userId, score: r._count.id })),
    );
    return;
  }

  if (metric === "TASKS_COMPLETED") {
    const rows = await prisma.userDailyTaskProgress.groupBy({
      by: ["userId"],
      // Only tasks the player went to /tasks and collected — auto-completed progress never scores.
      where: { rewardClaimedAt: { gte: startsAt, lte: upperBound } },
      _count: { id: true },
    });
    await batchUpsertEntries(
      tournament.id,
      rows.map((r) => ({ userId: r.userId, score: r._count.id })),
    );
    return;
  }

  if (metric === "DEPOSITS_POL") {
    if (isTournamentIncrementalScoringEnabled()) {
      registerTournamentMetricScorers();
      const scorer = getMetricScorer("DEPOSITS_POL");
      if (scorer) {
        const scores = await scorer.reconcile(
          {
            id: tournament.id,
            name: tournament.name,
            metric: "DEPOSITS_POL",
            startsAt,
            endsAt: tournament.endsAt,
            status: tournament.status as "ACTIVE",
          },
          { startsAt, endsAt: upperBound },
        );
        await batchUpsertEntries(
          tournament.id,
          Array.from(scores.entries())
            .map(([userId, b]) => ({ userId, score: b.total }))
            .filter((r) => r.score > 0),
        );
        return;
      }
    }
    const scores = await computeDepositScores(startsAt, upperBound);
    await batchUpsertEntries(
      tournament.id,
      Array.from(scores.entries())
        .map(([userId, b]) => ({ userId, score: b.total }))
        .filter((r) => r.score > 0),
    );
    return;
  }

  if (metric === "DEPOSITS_USD") {
    registerTournamentMetricScorers();
    const scorer = getMetricScorer("DEPOSITS_USD");
    if (!scorer) throw new Error("DEPOSITS_USD scorer not registered");
    const scores = await scorer.reconcile(
      {
        id: tournament.id,
        name: tournament.name,
        metric: "DEPOSITS_USD",
        startsAt,
        endsAt: tournament.endsAt,
        status: tournament.status as "ACTIVE",
      },
      { startsAt, endsAt: upperBound },
    );
    await batchUpsertEntries(
      tournament.id,
      Array.from(scores.entries())
        .map(([userId, b]) => ({ userId, score: b.total }))
        .filter((r) => r.score > 0),
    );
    return;
  }

  if (metric === "MINIGAME_WINS") {
    const rows = await prisma.gameSessionLog.groupBy({
      by: ["userId"],
      where: {
        success: true,
        rewardGranted: true,
        createdAt: { gte: startsAt, lte: upperBound },
      },
      _count: { id: true },
    });
    await batchUpsertEntries(
      tournament.id,
      rows.map((r) => ({ userId: r.userId, score: r._count.id })),
    );
    return;
  }

  if (metric === "FAUCET" || metric === "SHORTLINK" || metric === "AUTO_MINING" || metric === "YOUTUBE" || metric === "REFERRALS" || metric === "MERGES" || metric === "BURNS") {
    registerTournamentMetricScorers();
    const scorer = getMetricScorer(metric);
    if (!scorer) throw new Error(`${metric} scorer not registered`);
    const scores = await scorer.reconcile(
      {
        id: tournament.id,
        name: tournament.name,
        metric,
        startsAt,
        endsAt: tournament.endsAt,
        status: tournament.status as "ACTIVE",
      },
      { startsAt, endsAt: upperBound },
    );
    await batchUpsertEntries(
      tournament.id,
      Array.from(scores.entries())
        .map(([userId, b]) => ({ userId, score: b.total }))
        .filter((r) => r.score > 0),
    );
    return;
  }

  if (metric === "ALL_ACTIVITIES") {
    registerTournamentMetricScorers();
    const scorer = getMetricScorer("ALL_ACTIVITIES");
    if (!scorer) throw new Error("ALL_ACTIVITIES scorer not registered");
    const scores = await scorer.reconcile(
      {
        id: tournament.id,
        name: tournament.name,
        metric,
        startsAt,
        endsAt: tournament.endsAt,
        status: tournament.status as "ACTIVE",
      },
      { startsAt, endsAt: upperBound },
    );
    await batchUpsertEntries(
      tournament.id,
      Array.from(scores.entries())
        .map(([userId, b]) => ({ userId, score: b.total }))
        .filter((r) => r.score > 0),
    );
    return;
  }

  if (metric === "OFFERS_INTERNAL" || metric === "OFFERS_EXTERNAL" || metric === "OFFERS_ALL") {
    const { computeOfferwallScores } = await import("./tournaments.scoring-config.js");
    const scores = await computeOfferwallScores(startsAt, upperBound, { metric });
    await batchUpsertEntries(
      tournament.id,
      Array.from(scores.entries())
        .map(([userId, b]) => ({ userId, score: b.total, reachedAt: b.reachedAt }))
        .filter((r) => r.score > 0),
    );
    return;
  }
}
