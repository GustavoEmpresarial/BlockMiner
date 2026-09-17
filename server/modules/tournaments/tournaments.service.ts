import prisma, { type TxClient } from "../../core/database/prisma.js";
import { isDepositMetric } from "./tournaments.helpers.js";
import { formatUtcWindowLabel } from "./tournaments.scoring-config.js";
import { getDepositScoreDetailForUser } from "./deposit-score.js";
import { snapWindowForType, snapWindowForActiveTournament } from "./tournament-window.js";
import { computeScoresForTournament } from "./tournaments.score-computation.js";
import {
  backfillMinigameTournamentFromLogs,
  resolveTournamentStatusForWindow,
} from "./tournaments.minigame-backfill.js";
import {
  isTournamentSkipGetRecomputeEnabled,
  isTournamentIncrementalScoringEnabled,
} from "./tournaments.flags.js";
import { OFFERS_INCREMENTAL_METRICS, MINIGAME_INCREMENTAL_METRICS } from "./tournaments.providers.js";
import { registerTournamentMetricScorers, getMetricScorer } from "./tournaments.scorers.js";
import {
  getCachedLeaderboard,
  setCachedLeaderboard,
  invalidateLeaderboardCache,
} from "./tournaments.cache.js";
import { isDepositTournamentMetric, depositRankingUnit } from "./deposit-presentation.js";
import { reconcileTournament } from "./tournaments.engine.js";
import { invalidateTournamentCache } from "./tournaments.realtime.js";
import { createRewardInboxEntry, grantTemporaryPowerInTx } from "../notifications/index.js";
import { miningEngine, syncUserBaseHashRate } from "../mining/index.js";
import { logger } from "../../core/logger/index.js";
import { reportError } from "../../core/errors/index.js";
import { TOURNAMENT_ERROR } from "./tournaments.errors.js";
import { keyedSingleFlight } from "./tournaments.tick-guard.js";
import {
  assignRanks,
  findPrizeForRank,
  maxPrizeRank,
  resolvePrizeGrant,
  validatePrizeInput,
  type PrizeGrant,
  type PrizeRow,
} from "./tournaments.prize-resolution.js";

const log = logger.child("tournaments.service");

type TournamentEntry = {
  id: number;
  tournamentId: number;
  userId: number;
  score: number;
  rank: number | null;
  rewardGranted: boolean;
  rewardGrantedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export const LEADERBOARD_LIMIT = 100;

/** Ranks are written in short batched transactions — never one long-running tx. */
const RANK_BATCH_SIZE =
  Number.parseInt(String(process.env.TOURNAMENT_RANK_BATCH_SIZE || "200").trim(), 10) || 200;

export { computeScoresForTournament } from "./tournaments.score-computation.js";

export async function alignActiveTournamentWindows(): Promise<number> {
  const now = new Date();
  const active = await prisma.tournament.findMany({
    where: { status: "ACTIVE", type: { in: ["DAILY", "WEEKLY", "MONTHLY"] } },
  });
  let fixed = 0;
  for (const t of active) {
    const snap = snapWindowForActiveTournament(t.type, t.startsAt, t.endsAt, now);
    if (!snap) continue;
    if (t.startsAt.getTime() === snap.start.getTime() && t.endsAt.getTime() === snap.end.getTime()) {
      continue;
    }
    await prisma.tournament.update({
      where: { id: t.id },
      data: { startsAt: snap.start, endsAt: snap.end },
    });
    const isOfferwall = (OFFERS_INCREMENTAL_METRICS as readonly string[]).includes(t.metric);
    const isMinigame = (MINIGAME_INCREMENTAL_METRICS as readonly string[]).includes(t.metric);
    const isBlocks = t.metric === "BLOCKS_MINED";
    if (!isBlocks && ((!isOfferwall && !isMinigame) || !isTournamentIncrementalScoringEnabled())) {
      await computeScoresForTournament({ ...t, startsAt: snap.start, endsAt: snap.end });
    }
    fixed++;
    log.info(
      `[tournaments] aligned #${t.id} "${t.name}" → UTC ${snap.start.toISOString()} .. ${snap.end.toISOString()}`,
    );
  }
  return fixed;
}

function nextCycleWindow(
  type: string | undefined,
  prevEnd: Date,
  duration: number,
): { newStart: Date; newEnd: Date } {
  const snap = snapWindowForType(type, prevEnd);
  if (!snap) return { newStart: prevEnd, newEnd: new Date(prevEnd.getTime() + duration) };

  let { start, end } = snap;
  if (start < prevEnd) {
    const next = snapWindowForType(type, end);
    if (next) ({ start, end } = next);
    else return { newStart: prevEnd, newEnd: new Date(prevEnd.getTime() + duration) };
  }
  const now = new Date();
  let safety = 0;
  while (end <= now && safety < 366) {
    const next = snapWindowForType(type, end);
    if (!next) break;
    ({ start, end } = next);
    safety++;
  }
  return { newStart: start, newEnd: end };
}

/**
 * Closes a tournament: score → rank → grant → end.
 *
 * Deliberately split into short phases. An earlier version wrapped the whole
 * thing — every entry, every grant — in one interactive transaction; past the
 * 15s budget (core/database/prisma.ts) it aborted with P2028, rolled back every
 * prize, left the tournament ACTIVE, and the 60s lifecycle cron retried it
 * forever. Nobody got paid. Keep each transaction here small and per-unit.
 */
async function runFinalizeTournament(
  tournamentId: number,
): Promise<{ ranked: number; rewarded: number; failed: number; nextId: number | null }> {
  await miningEngine.drainSettlements();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { prizes: { include: { miner: true } } },
  });
  if (!tournament) throw new Error("Tournament not found");
  if (tournament.status === "ENDED") {
    return { ranked: 0, rewarded: 0, failed: 0, nextId: null };
  }

  // ── Phase A — scoring (no transaction) ──────────────────────────────────
  if (isTournamentIncrementalScoringEnabled()) {
    registerTournamentMetricScorers();
    await reconcileTournament(tournamentId, { recomputeBlocks: true });
  } else {
    await computeScoresForTournament(tournament);
  }

  // ── Phase B — ranking, in short batches ─────────────────────────────────
  // Read immediately after scoring so late in-window callbacks have the
  // smallest possible chance of landing between the snapshot and the ranks.
  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    orderBy: [{ score: "desc" }, { firstContributionAt: "asc" }],
  });
  const ranked = assignRanks(entries);
  await persistRanks(ranked);

  // ── Phase C — grants, one short transaction per winner ──────────────────
  // Only entries inside a prize band can win, so this loop is bounded by the
  // prize table rather than by how many people entered.
  const cutoff = maxPrizeRank(tournament.prizes);
  let rewarded = 0;
  let failed = 0;
  const powerGrantUserIds = new Set<number>();

  for (const entry of ranked.slice(0, cutoff)) {
    const prize = findPrizeForRank(tournament.prizes, entry.rank);
    if (!prize) continue;

    const grant = resolvePrizeGrant(prize as PrizeRow);
    if (grant.kind === "invalid") {
      failed++;
      // impact HIGH, not CRITICAL: exactly one player goes unpaid and the row is
      // still fixable by an admin — the tournament itself stays consistent.
      reportError({
        code: grant.code,
        category: "BUSINESS",
        severity: "ERROR",
        impact: "HIGH",
        module: "tournaments",
        operation: "finalizeTournament.resolvePrize",
        context: {
          reason: grant.reason,
          tournamentId,
          entryId: entry.id,
          userId: entry.userId,
          prizeId: prize.id,
          prizeType: prize.prizeType,
          rank: entry.rank,
        },
      });
      continue;
    }

    try {
      // The atomic claim IS the idempotency primitive, for every prize type.
      // If the grant below throws, the claim rolls back with it and the entry
      // stays payable — it is never flagged as rewarded without a real grant.
      const didGrant = await prisma.$transaction(async (tx) => {
        const claim = await tx.tournamentEntry.updateMany({
          where: { id: entry.id, rewardGranted: false },
          data: { rewardGranted: true, rewardGrantedAt: new Date() },
        });
        if (claim.count !== 1) return false; // an earlier pass already paid this one
        await applyGrant(tx, {
          userId: entry.userId,
          entryId: entry.id,
          tournamentId,
          tournamentName: tournament.name,
          grant,
        });
        return true;
      });

      if (didGrant) {
        rewarded++;
        if (grant.kind === "boost") powerGrantUserIds.add(entry.userId);
      }
    } catch (err) {
      // One broken prize must not cost the other winners theirs.
      failed++;
      reportError({
        code: TOURNAMENT_ERROR.GRANT_FAILED,
        category: "BUSINESS",
        severity: "ERROR",
        impact: "HIGH",
        module: "tournaments",
        operation: "finalizeTournament.grant",
        error: err,
        context: {
          tournamentId,
          entryId: entry.id,
          userId: entry.userId,
          prizeId: prize.id,
          prizeType: prize.prizeType,
          grantKind: grant.kind,
          rank: entry.rank,
        },
      });
    }
  }

  // ── Phase D — close it out, even on partial failure ─────────────────────
  // Ending unconditionally is what breaks the infinite retry loop and lets the
  // recurring cycle spawn. Ungranted winners stay rewardGranted:false and are
  // reported below rather than silently swallowed.
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "ENDED" },
  });

  if (failed > 0) {
    // impact CRITICAL: the tournament is closed and will never retry on its own,
    // so every unpaid winner here needs a human before the prize is really lost.
    reportError({
      code: TOURNAMENT_ERROR.FINALIZE_PARTIAL,
      category: "BUSINESS",
      severity: "CRITICAL",
      impact: "CRITICAL",
      module: "tournaments",
      operation: "finalizeTournament",
      context: {
        tournamentId,
        tournamentName: tournament.name,
        metric: tournament.metric,
        ranked: ranked.length,
        rewarded,
        failed,
      },
    });
  }

  for (const userId of powerGrantUserIds) {
    await syncUserBaseHashRate(userId).catch(() => undefined);
  }

  let nextId: number | null = null;
  if (tournament.recurring) {
    try {
      const duration = tournament.endsAt.getTime() - tournament.startsAt.getTime();
      const { newStart, newEnd } = nextCycleWindow(tournament.type, tournament.endsAt, duration);
      const next = await prisma.tournament.create({
        data: {
          name: tournament.name,
          description: tournament.description,
          type: tournament.type,
          metric: tournament.metric,
          startsAt: newStart,
          endsAt: newEnd,
          recurring: true,
          status: newStart <= new Date() ? "ACTIVE" : "SCHEDULED",
          prizes: {
            create: tournament.prizes.map((p) => ({
              rankFrom: p.rankFrom,
              rankTo: p.rankTo,
              prizeType: p.prizeType,
              polAmount: p.polAmount,
              blkAmount: p.blkAmount,
              boostHashRate: p.boostHashRate,
              boostHours: p.boostHours,
              minerId: p.minerId,
              minerCount: p.minerCount ?? 1,
            })),
          },
        },
      });
      nextId = next.id;
      log.info(`[tournaments] recurring: spawned next cycle #${next.id} for "${tournament.name}"`);
      if (next.status === "ACTIVE" && next.metric === "MINIGAME_WINS") {
        void backfillMinigameTournamentFromLogs(next.id).catch((err) => {
          reportError({
            code: TOURNAMENT_ERROR.MINIGAME_BACKFILL_FAILED,
            category: "BUSINESS",
            severity: "ERROR",
            impact: "HIGH",
            module: "tournaments",
            operation: "finalizeTournament.backfillNextCycle",
            error: err,
            context: { tournamentId: next.id, tournamentName: next.name },
          });
        });
      }
    } catch (err) {
      // The series silently stops here: this cycle is ENDED and no next one
      // exists, so nothing will ever retry it. Needs a human.
      reportError({
        code: TOURNAMENT_ERROR.RECURRING_SPAWN_FAILED,
        category: "BUSINESS",
        severity: "CRITICAL",
        impact: "HIGH",
        module: "tournaments",
        operation: "finalizeTournament.spawnNextCycle",
        error: err,
        context: {
          tournamentId,
          tournamentName: tournament.name,
          type: tournament.type,
          metric: tournament.metric,
        },
      });
    }
  }

  await invalidateTournamentCaches(tournamentId, tournament.metric);
  return { ranked: ranked.length, rewarded, failed, nextId };
}

/**
 * Two callers can reach finalization for the same tournament at the same time:
 * the 60s lifecycle cron tick and the admin `POST /:id/finalize` button. Both
 * would read `status: ACTIVE` before either wrote ENDED, both would enter the
 * `recurring` branch, and `prisma.tournament.create` would run twice — forking
 * the series into two duplicate tournaments. The atomic rewardGranted claim
 * prevents paying a prize twice; it does not prevent that.
 *
 * Keyed on tournamentId, so finalizing two different tournaments still runs in
 * parallel. A second caller joins the in-flight run and receives its real
 * result rather than a silent no-op.
 */
export const finalizeTournament = keyedSingleFlight(runFinalizeTournament);

/**
 * Writes ranks in batched transactions. Prisma has no bulk "different value per
 * row" update, so this sends chunks as array transactions: one round trip per
 * chunk instead of one per entry, and a fresh short transaction each time.
 */
async function persistRanks(ranked: ReadonlyArray<{ id: number; rank: number }>): Promise<void> {
  for (let i = 0; i < ranked.length; i += RANK_BATCH_SIZE) {
    const batch = ranked.slice(i, i + RANK_BATCH_SIZE);
    await prisma.$transaction(
      batch.map((entry) =>
        prisma.tournamentEntry.update({ where: { id: entry.id }, data: { rank: entry.rank } }),
      ),
    );
  }
}

async function invalidateTournamentCaches(tournamentId: number, metric?: string): Promise<void> {
  await invalidateLeaderboardCache(tournamentId);
  invalidateActiveTournamentsCache();
  invalidateTournamentCache(metric);
}

/**
 * Performs an already-validated grant. Every branch here writes something —
 * validation and refusal live in resolvePrizeGrant, so this function can no
 * longer "succeed" by falling through without granting anything.
 *
 * Callers must run this inside the same transaction as the rewardGranted claim:
 * that pairing is what makes the grant idempotent and rollback-safe.
 */
async function applyGrant(
  tx: TxClient,
  ctx: {
    userId: number;
    entryId: number;
    tournamentId: number;
    tournamentName: string;
    grant: Exclude<PrizeGrant, { kind: "invalid" }>;
  },
): Promise<void> {
  const { userId, entryId, tournamentId, tournamentName, grant } = ctx;
  const source = "tournament";
  const meta = { tournamentName, tournamentId, entryId };

  switch (grant.kind) {
    case "pol":
    case "blk":
      await createRewardInboxEntry(tx, {
        userId,
        source,
        rewardType: grant.kind,
        rewardValue: grant.amount,
        metaJson: meta,
      });
      return;

    case "boost":
      await grantTemporaryPowerInTx(tx, userId, {
        rewardValue: grant.hashRate,
        durationHours: grant.hours,
        rewardType: "hashrate_boost",
        source,
      });
      return;

    case "machine":
      for (let k = 0; k < grant.quantity; k++) {
        await createRewardInboxEntry(tx, {
          userId,
          source,
          rewardType: "machine",
          rewardValue: grant.hashRate,
          minerId: grant.minerId,
          minerName: grant.minerName,
          minerImageUrl: grant.minerImageUrl,
          slotSize: grant.slotSize,
          metaJson: meta,
        });
      }
  }
}

/**
 * Refuses prize rows that could never be paid out, at write time.
 * Throws in the codebase's existing shape: Error carrying a stable `code`.
 */
function assertPrizesArePayable(prizes: readonly PrizeRow[] | undefined): void {
  if (!prizes) return;
  for (const prize of prizes) {
    const check = validatePrizeInput(prize);
    if (!check.ok) {
      throw Object.assign(new Error(check.code), {
        code: check.code,
        status: 400,
        reason: check.reason,
      });
    }
  }
}

const DEFAULT_TYPE_ORDER = ["MONTHLY", "WEEKLY", "DAILY", "CUSTOM"];

export async function getTypeDisplayOrder(): Promise<string[]> {
  const row = await prisma.tournamentDisplayConfig.findUnique({ where: { id: 1 } });
  const order = row?.typeOrder;
  if (Array.isArray(order) && order.every((x) => typeof x === "string")) return order as string[];
  return DEFAULT_TYPE_ORDER;
}

export async function setTypeDisplayOrder(typeOrder: string[]): Promise<string[]> {
  const valid = new Set(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]);
  const clean = typeOrder.filter((t) => valid.has(t));
  for (const t of valid) if (!clean.includes(t)) clean.push(t);
  await prisma.tournamentDisplayConfig.upsert({
    where: { id: 1 },
    update: { typeOrder: clean },
    create: { id: 1, typeOrder: clean },
  });
  return clean;
}

function sortByTypeOrder<T extends { type: string; startsAt: Date }>(list: T[], order: string[]): T[] {
  const idx = (t: string) => {
    const i = order.indexOf(t);
    return i === -1 ? order.length : i;
  };
  return [...list].sort((a, b) => {
    const d = idx(a.type) - idx(b.type);
    if (d !== 0) return d;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}

const ACTIVE_LIST_TTL_MS = 15_000;
let activeListCache: { at: number; data: unknown } | null = null;

export function invalidateActiveTournamentsCache(): void {
  activeListCache = null;
}

export async function listActiveTournaments() {
  const cached = activeListCache;
  if (cached && Date.now() - cached.at < ACTIVE_LIST_TTL_MS) {
    return cached.data as Awaited<ReturnType<typeof buildActiveTournamentsList>>;
  }
  const data = await buildActiveTournamentsList();
  activeListCache = { at: Date.now(), data };
  return data;
}

/** Player hub: faucet / shortlink / auto-mining series are hidden until product re-enables them. */
const PLAYER_HUB_HIDDEN_METRICS = ["FAUCET", "SHORTLINK", "AUTO_MINING"] as const;

async function buildActiveTournamentsList() {
  const order = await getTypeDisplayOrder();
  const now = new Date();
  const rows = await prisma.tournament.findMany({
    where: {
      status: { in: ["ACTIVE", "SCHEDULED"] },
      metric: { notIn: [...PLAYER_HUB_HIDDEN_METRICS] },
    },
    include: {
      prizes: {
        orderBy: { rankFrom: "asc" },
        include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } },
      },
      _count: { select: { entries: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  return sortByTypeOrder(
    rows.map((t) => ({
      ...t,
      windowUtc: formatUtcWindowLabel(t.startsAt, t.endsAt),
      windowUtcNow: formatUtcWindowLabel(t.startsAt, t.endsAt < now ? t.endsAt : now),
    })),
    order,
  );
}

async function enrichDepositLeaderboardWithPolTotals<T extends { userId: number }>(
  top: T[],
  startsAt: Date,
  upperBound: Date,
): Promise<Array<T & { scorePol: number }>> {
  if (top.length === 0) return [];

  const userIds = top.map((e) => e.userId);
  const rows = await prisma.transaction.groupBy({
    by: ["userId"],
    where: {
      userId: { in: userIds },
      type: "deposit",
      status: "completed",
      countsForTournament: true,
      confirmedEventAt: { gte: startsAt, lte: upperBound },
    },
    _sum: { amount: true },
  });
  const polByUser = new Map<number, number>(
    rows.map((r) => [r.userId, Number(r._sum.amount ?? 0)]),
  );

  return top.map((entry) => ({
    ...entry,
    scorePol: polByUser.get(entry.userId) ?? 0,
  }));
}

export async function getTournamentWithLeaderboard(tournamentId: number, userId?: number) {
  let tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      prizes: {
        orderBy: { rankFrom: "asc" },
        include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } },
      },
      _count: { select: { entries: true } },
    },
  });
  if (!tournament) return null;

  let scoresComputedAt: string | null = null;
  const skipRecompute = isTournamentSkipGetRecomputeEnabled();
  const blockScoreIsOutboxOwned = tournament.metric === "BLOCKS_MINED";
  if (tournament.status === "ACTIVE" && !skipRecompute && !blockScoreIsOutboxOwned) {
    await computeScoresForTournament(tournament);
    scoresComputedAt = new Date().toISOString();
    tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        prizes: {
          orderBy: { rankFrom: "asc" },
          include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } },
        },
        _count: { select: { entries: true } },
      },
    });
    if (!tournament) return null;
  } else if (tournament.status === "ACTIVE") {
    scoresComputedAt = tournament.scoresReconciledAt?.toISOString() ?? null;
  }

  type TopEntry = Awaited<ReturnType<typeof prisma.tournamentEntry.findMany>>[number];
  const upperBound = tournament.endsAt < new Date() ? tournament.endsAt : new Date();
  let top: TopEntry[] | null = await getCachedLeaderboard<TopEntry[]>(tournamentId);
  if (!top) {
    top = await prisma.tournamentEntry.findMany({
      where: { tournamentId },
      orderBy: [{ score: "desc" }, { firstContributionAt: "asc" }],
      take: LEADERBOARD_LIMIT,
      include: {
        user: {
          select: { id: true, username: true, name: true },
        },
      },
    });
    await setCachedLeaderboard(tournamentId, top);
  }
  if (tournament.metric === "DEPOSITS_USD" && top && top.length > 0) {
    top = await enrichDepositLeaderboardWithPolTotals(top, tournament.startsAt, upperBound);
  }

  let myEntry: TournamentEntry | null = null;
  let myRankLive: number | null = null;
  let myPrize: { prizeType: string } | null = null;
  let myDepositBreakdown: Awaited<ReturnType<typeof getDepositScoreDetailForUser>> | null = null;
  const depositMetric = isDepositMetric(tournament.metric);

  if (userId) {
    myEntry = await prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (myEntry) {
      myRankLive =
        (await prisma.tournamentEntry.count({
          where: { tournamentId, score: { gt: myEntry.score } },
        })) + 1;
      const rank = myEntry.rank ?? myRankLive;
      if (rank != null) {
        const prize = tournament.prizes.find((p) => rank >= p.rankFrom && rank <= p.rankTo);
        if (prize) myPrize = { prizeType: prize.prizeType };
      }
    }
    if (depositMetric) {
      registerTournamentMetricScorers();
      const scorer = getMetricScorer(tournament.metric as "DEPOSITS_POL" | "DEPOSITS_USD");
      if (scorer?.getUserBreakdown) {
        myDepositBreakdown = (await scorer.getUserBreakdown(
          userId,
          {
            id: tournament.id,
            name: tournament.name,
            metric: tournament.metric as "DEPOSITS_POL" | "DEPOSITS_USD",
            startsAt: tournament.startsAt,
            endsAt: tournament.endsAt,
            status: tournament.status as "ACTIVE",
          },
          { startsAt: tournament.startsAt, endsAt: upperBound },
        )) as typeof myDepositBreakdown;
      } else {
        myDepositBreakdown = await getDepositScoreDetailForUser(
          userId,
          tournament.startsAt,
          upperBound,
        );
      }
    }
  }

  return {
    tournament: {
      ...tournament,
      depositRankingUnit: isDepositTournamentMetric(tournament.metric)
        ? depositRankingUnit(tournament.metric)
        : undefined,
      windowUtc: formatUtcWindowLabel(tournament.startsAt, tournament.endsAt),
      windowUtcNow: formatUtcWindowLabel(
        tournament.startsAt,
        tournament.endsAt < new Date() ? tournament.endsAt : new Date(),
      ),
    },
    top,
    myEntry,
    myRankLive,
    myPrize,
    scoresComputedAt,
    myDepositBreakdown:
      depositMetric && myDepositBreakdown
        ? { breakdown: (myDepositBreakdown as { breakdown: Record<string, unknown> }).breakdown }
        : null,
  };
}

export async function getUserTournamentHistory(userId: number) {
  return prisma.tournamentEntry.findMany({
    where: { userId, tournament: { status: { in: ["ENDED", "ACTIVE"] } } },
    include: {
      tournament: {
        select: { id: true, name: true, type: true, metric: true, status: true, endsAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function adminListTournaments() {
  const order = await getTypeDisplayOrder();
  const rows = await prisma.tournament.findMany({
    include: {
      prizes: {
        orderBy: { rankFrom: "asc" },
        include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } },
      },
      _count: { select: { entries: true } },
    },
    orderBy: { startsAt: "desc" },
  });
  return sortByTypeOrder(rows, order);
}

export async function adminCreateTournament(data: {
  name: string;
  description?: string;
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
  metric: import("./tournaments.valid-metrics.js").TournamentValidMetric;
  startsAt: Date;
  endsAt: Date;
  recurring?: boolean;
  prizes: Array<{
    rankFrom: number;
    rankTo: number;
    prizeType: "POL" | "BLK" | "MINING_BOOST" | "MACHINE";
    polAmount?: number;
    blkAmount?: number;
    boostHashRate?: number;
    boostHours?: number;
    minerId?: number;
    minerCount?: number;
  }>;
}) {
  assertPrizesArePayable(data.prizes);

  let startsAt = data.startsAt;
  let endsAt = data.endsAt;
  if (data.type !== "CUSTOM") {
    const snap = snapWindowForType(data.type, data.startsAt);
    if (snap) {
      startsAt = snap.start;
      endsAt = snap.end;
    }
  }

  const now = new Date();
  const status = resolveTournamentStatusForWindow(startsAt, endsAt, now);

  invalidateActiveTournamentsCache();
  const tournament = await prisma.tournament.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type,
      metric: data.metric,
      startsAt,
      endsAt,
      status,
      recurring: data.recurring ?? false,
      prizes: {
        create: data.prizes.map((p) => ({
          rankFrom: p.rankFrom,
          rankTo: p.rankTo,
          prizeType: p.prizeType,
          polAmount: p.polAmount ?? null,
          blkAmount: p.blkAmount ?? null,
          boostHashRate: p.boostHashRate ?? null,
          boostHours: p.boostHours ?? null,
          minerId: p.minerId ?? null,
          minerCount: p.minerCount ?? 1,
        })),
      },
    },
    include: { prizes: true },
  });

  if (status === "ACTIVE" && data.metric === "MINIGAME_WINS") {
    void backfillMinigameTournamentFromLogs(tournament.id).catch((err) => {
      reportError({
        code: TOURNAMENT_ERROR.MINIGAME_BACKFILL_FAILED,
        category: "BUSINESS",
        severity: "ERROR",
        impact: "HIGH",
        module: "tournaments",
        operation: "adminCreateTournament.backfill",
        error: err,
        context: { tournamentId: tournament.id, tournamentName: tournament.name },
      });
    });
  }

  return tournament;
}

export async function adminUpdateTournament(
  tournamentId: number,
  data: {
    name?: string;
    description?: string | null;
    type?: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
    metric?: import("./tournaments.valid-metrics.js").TournamentValidMetric;
    startsAt?: Date;
    endsAt?: Date;
    recurring?: boolean;
    prizes?: Array<{
      rankFrom: number;
      rankTo: number;
      prizeType: "POL" | "BLK" | "MINING_BOOST" | "MACHINE";
      polAmount?: number;
      blkAmount?: number;
      boostHashRate?: number;
      boostHours?: number;
      minerId?: number;
      minerCount?: number;
    }>;
  },
) {
  assertPrizesArePayable(data.prizes);

  const existing = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!existing) throw new Error("Tournament not found");
  if (existing.status === "ENDED" || existing.status === "CANCELLED") {
    throw new Error("Cannot edit an ended or cancelled tournament");
  }

  return prisma
    .$transaction(async (tx) => {
      if (data.prizes) {
        await tx.tournamentPrize.deleteMany({ where: { tournamentId } });
      }
      return tx.tournament.update({
        where: { id: tournamentId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.metric !== undefined ? { metric: data.metric } : {}),
          ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
          ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
          ...(data.recurring !== undefined ? { recurring: data.recurring } : {}),
          ...(data.prizes
            ? {
                prizes: {
                  create: data.prizes.map((p) => ({
                    rankFrom: p.rankFrom,
                    rankTo: p.rankTo,
                    prizeType: p.prizeType,
                    polAmount: p.polAmount ?? null,
                    blkAmount: p.blkAmount ?? null,
                    boostHashRate: p.boostHashRate ?? null,
                    boostHours: p.boostHours ?? null,
                    minerId: p.minerId ?? null,
                    minerCount: p.minerCount ?? 1,
                  })),
                },
              }
            : {}),
        },
        include: { prizes: true },
      });
    })
    .then(async (updated) => {
      await invalidateTournamentCaches(tournamentId, existing.metric);
      return updated;
    });
}

export async function adminCancelTournament(tournamentId: number) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new Error("Tournament not found");
  if (t.status === "ENDED") throw new Error("Cannot cancel an ended tournament");
  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "CANCELLED" },
  });
  await invalidateTournamentCaches(tournamentId, t.metric);
  return updated;
}

export async function adminGetEntries(tournamentId: number, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    prisma.tournamentEntry.findMany({
      where: { tournamentId },
      orderBy: { score: "desc" },
      skip,
      take: limit,
      include: { user: { select: { id: true, username: true, name: true } } },
    }),
    prisma.tournamentEntry.count({ where: { tournamentId } }),
  ]);
  return { entries, total, page, limit };
}

export {
  tournamentUpperBound,
  isAuditableMetric,
  adminTournamentScoreAudit,
  adminTournamentScoreAuditUser,
  getMyTournamentScoreBreakdown,
} from "./tournaments.audit.js";
