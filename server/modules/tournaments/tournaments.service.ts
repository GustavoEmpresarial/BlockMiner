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
type TournamentPrize = {
  id: number;
  tournamentId: number;
  rankFrom: number;
  rankTo: number;
  prizeType: string;
  polAmount: number | null;
  blkAmount: number | null;
  boostHashRate: number | null;
  boostHours: number | null;
  minerId: number | null;
  minerCount: number | null;
  miner?: {
    id: number;
    name: string;
    imageUrl: string | null;
    baseHashRate: unknown;
    slotSize?: number | null;
  } | null;
};

export const LEADERBOARD_LIMIT = 100;

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

export async function finalizeTournament(
  tournamentId: number,
): Promise<{ ranked: number; rewarded: number; nextId: number | null }> {
  await miningEngine.drainSettlements();
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { prizes: { include: { miner: true } } },
  });
  if (!tournament) throw new Error("Tournament not found");
  if (tournament.status === "ENDED") return { ranked: 0, rewarded: 0, nextId: null };

  if (isTournamentIncrementalScoringEnabled()) {
    registerTournamentMetricScorers();
    await reconcileTournament(tournamentId, { recomputeBlocks: true });
  } else {
    await computeScoresForTournament(tournament);
  }

  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    orderBy: [{ score: "desc" }, { firstContributionAt: "asc" }],
  });

  let rewarded = 0;
  const powerGrantUserIds = new Set<number>();
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < entries.length; i++) {
      const rank = i + 1;
      const entry = entries[i];
      const prize = tournament.prizes.find((p) => rank >= p.rankFrom && rank <= p.rankTo);

      const grantedUpdate = await tx.tournamentEntry.updateMany({
        where: { id: entry.id, rewardGranted: false },
        data: {
          rank,
          rewardGranted: !!prize,
          rewardGrantedAt: prize ? new Date() : null,
        },
      });

      if (prize && grantedUpdate.count === 1) {
        await grantPrize(tx, {
          userId: entry.userId,
          entryId: entry.id,
          tournamentId,
          tournamentName: tournament.name,
          prize: prize as TournamentPrize,
        });
        if (prize.prizeType === "MINING_BOOST") powerGrantUserIds.add(entry.userId);
        rewarded++;
      } else if (prize && grantedUpdate.count === 0) {
        // Another finalize pass already granted — keep idempotent.
        await tx.tournamentEntry.update({
          where: { id: entry.id },
          data: { rank },
        });
      } else if (!prize) {
        await tx.tournamentEntry.update({
          where: { id: entry.id },
          data: { rank },
        });
      }
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: "ENDED" },
    });
  });

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
          log.error(`[tournaments] minigame backfill recurring #${next.id}:`, {
            error: String(err),
          });
        });
      }
    } catch (err) {
      log.error(`[tournaments] failed to spawn next cycle for #${tournamentId}:`, {
        error: String(err),
      });
    }
  }

  await invalidateTournamentCaches(tournamentId, tournament.metric);
  return { ranked: entries.length, rewarded, nextId };
}

async function invalidateTournamentCaches(tournamentId: number, metric?: string): Promise<void> {
  await invalidateLeaderboardCache(tournamentId);
  invalidateActiveTournamentsCache();
  invalidateTournamentCache(metric);
}

async function countInboxGrantsForEntryTx(
  tx: TxClient,
  userId: number,
  entryId: number,
): Promise<number> {
  return tx.userRewardInbox.count({
    where: {
      userId,
      source: "tournament",
      metaJson: { path: ["entryId"], equals: entryId },
    },
  });
}

async function grantPrize(
  tx: TxClient,
  ctx: {
    userId: number;
    entryId: number;
    tournamentId: number;
    tournamentName: string;
    prize: TournamentPrize;
  },
): Promise<void> {
  const { userId, entryId, tournamentId, tournamentName, prize } = ctx;
  const source = "tournament";
  const meta = { tournamentName, tournamentId, entryId };

  if ((await countInboxGrantsForEntryTx(tx, userId, entryId)) > 0) {
    return;
  }

  if (prize.prizeType === "POL" && prize.polAmount) {
    await createRewardInboxEntry(tx, {
      userId,
      source,
      rewardType: "pol",
      rewardValue: prize.polAmount,
      metaJson: meta,
    });
    return;
  }

  if (prize.prizeType === "BLK" && prize.blkAmount) {
    await createRewardInboxEntry(tx, {
      userId,
      source,
      rewardType: "blk",
      rewardValue: prize.blkAmount,
      metaJson: meta,
    });
    return;
  }

  if (prize.prizeType === "MINING_BOOST" && prize.boostHashRate && prize.boostHours) {
    await grantTemporaryPowerInTx(tx, userId, {
      rewardValue: prize.boostHashRate,
      durationHours: prize.boostHours,
      rewardType: "hashrate_boost",
      source,
    });
    return;
  }

  if (prize.prizeType === "MACHINE") {
    if (!prize.miner) {
      log.error("tournament MACHINE prize missing miner catalog row", {
        tournamentId,
        entryId,
        userId,
        minerId: prize.minerId,
      });
      throw new Error("TOURNAMENT_MACHINE_PRIZE_MINER_MISSING");
    }
    const hashRate = Number(prize.miner.baseHashRate ?? 0);
    const quantity = Math.max(1, prize.minerCount ?? 1);
    for (let k = 0; k < quantity; k++) {
      await createRewardInboxEntry(tx, {
        userId,
        source,
        rewardType: "machine",
        rewardValue: hashRate,
        minerId: prize.miner.id,
        minerName: prize.miner.name,
        minerImageUrl: prize.miner.imageUrl ?? null,
        slotSize: prize.miner.slotSize ?? 1,
        metaJson: meta,
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
      log.error(`[tournaments] minigame backfill failed for #${tournament.id}:`, {
        error: String(err),
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
