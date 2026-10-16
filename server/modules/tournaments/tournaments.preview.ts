/**
 * Dev-only preview tournaments (TOURNAMENT_PREVIEW_METRICS).
 *
 * The dev VM shares the production database and production runs the only
 * tournament cron, so any row written to `tournaments` is shown, scored and
 * paid by production. Preview tournaments therefore never touch the table:
 * they are built in memory, ranked live from the same source data the real
 * scorers read, and have no finalize/payout path at all.
 */
import prisma from "../../core/database/prisma.js";
import { snapWindowForType } from "./tournament-window.js";
import { formatUtcWindowLabel } from "./tournaments.scoring-config.js";
import { getMetricScorer, registerTournamentMetricScorers } from "./tournaments.scorers.js";
import { LEADERBOARD_LIMIT } from "./tournaments.service.js";

type PreviewType = "DAILY" | "WEEKLY" | "MONTHLY";

type PreviewPrize = {
  rankFrom: number;
  rankTo: number;
  prizeType: "MACHINE" | "MINING_BOOST";
  minerId?: number;
  boostHashRate?: number;
  boostHours?: number;
};

type PreviewDef = { metric: string; type: PreviewType; name: string; description: string };

/** Negative ids can never collide with real (autoincrement) tournament ids. */
const PREVIEW_ID_BASE = -900_000;

const METRIC_SLOT: Record<string, number> = { MERGES: 1, BURNS: 2, TASKS_COMPLETED: 3 };
const TYPE_SLOT: Record<PreviewType, number> = { DAILY: 1, WEEKLY: 2, MONTHLY: 3 };

const PREVIEW_DEFS: PreviewDef[] = [
  { metric: "MERGES", type: "DAILY", name: "Daily Forge Tournament", description: "Daily ranking by forge points." },
  { metric: "MERGES", type: "WEEKLY", name: "Weekly Forge Tournament", description: "Weekly ranking by forge points." },
  { metric: "MERGES", type: "MONTHLY", name: "Monthly Forge Tournament", description: "Monthly ranking by forge points." },
  { metric: "BURNS", type: "DAILY", name: "Daily Burn Tournament", description: "Daily ranking by hashrate burned." },
  { metric: "BURNS", type: "WEEKLY", name: "Weekly Burn Tournament", description: "Weekly ranking by hashrate burned." },
  { metric: "BURNS", type: "MONTHLY", name: "Monthly Burn Tournament", description: "Monthly ranking by hashrate burned." },
  { metric: "TASKS_COMPLETED", type: "WEEKLY", name: "Weekly Tasks Tournament", description: "Weekly ranking by daily tasks completed." },
  { metric: "TASKS_COMPLETED", type: "MONTHLY", name: "Monthly Tasks Tournament", description: "Monthly ranking by daily tasks completed." },
];

/** Same ladders as the admin presets: machines on top, Mining Boost below, never BLK. */
const MINER = { hashTitan: 10, cryptoDrill: 30, quantumForge: 209, neonHash: 211, ironPulse: 212, blackNova: 213 };
const PRIZE_LADDER: Record<PreviewType, PreviewPrize[]> = {
  DAILY: [
    { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: MINER.cryptoDrill },
    { rankFrom: 2, rankTo: 2, prizeType: "MACHINE", minerId: MINER.neonHash },
    { rankFrom: 3, rankTo: 3, prizeType: "MACHINE", minerId: MINER.hashTitan },
    { rankFrom: 4, rankTo: 10, prizeType: "MACHINE", minerId: MINER.quantumForge },
    { rankFrom: 11, rankTo: 25, prizeType: "MINING_BOOST", boostHashRate: 150, boostHours: 24 },
  ],
  WEEKLY: [
    { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: MINER.ironPulse },
    { rankFrom: 2, rankTo: 2, prizeType: "MACHINE", minerId: MINER.cryptoDrill },
    { rankFrom: 3, rankTo: 3, prizeType: "MACHINE", minerId: MINER.neonHash },
    { rankFrom: 4, rankTo: 10, prizeType: "MACHINE", minerId: MINER.hashTitan },
    { rankFrom: 11, rankTo: 25, prizeType: "MINING_BOOST", boostHashRate: 400, boostHours: 168 },
  ],
  MONTHLY: [
    { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: MINER.blackNova },
    { rankFrom: 2, rankTo: 2, prizeType: "MACHINE", minerId: MINER.ironPulse },
    { rankFrom: 3, rankTo: 3, prizeType: "MACHINE", minerId: MINER.cryptoDrill },
    { rankFrom: 4, rankTo: 10, prizeType: "MACHINE", minerId: MINER.neonHash },
    { rankFrom: 11, rankTo: 25, prizeType: "MINING_BOOST", boostHashRate: 500, boostHours: 168 },
  ],
};

export function enabledPreviewMetrics(): Set<string> {
  const raw = String(process.env.TOURNAMENT_PREVIEW_METRICS ?? "").trim();
  if (!raw) return new Set();
  return new Set(raw.split(",").map((m) => m.trim().toUpperCase()).filter((m) => m in METRIC_SLOT));
}

export function previewTournamentId(metric: string, type: PreviewType): number {
  return PREVIEW_ID_BASE - METRIC_SLOT[metric] * 10 - TYPE_SLOT[type];
}

function enabledDefs(): PreviewDef[] {
  const metrics = enabledPreviewMetrics();
  return PREVIEW_DEFS.filter((d) => metrics.has(d.metric));
}

export function isPreviewTournamentId(id: number): boolean {
  return enabledDefs().some((d) => previewTournamentId(d.metric, d.type) === id);
}

async function buildPrizes(type: PreviewType) {
  const ladder = PRIZE_LADDER[type];
  const ids = ladder.map((p) => p.minerId).filter((x): x is number => x != null);
  const miners = await prisma.miner.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, imageUrl: true, baseHashRate: true },
  });
  const byId = new Map(miners.map((m) => [m.id, m]));
  return ladder.map((p, i) => ({
    id: -(i + 1),
    rankFrom: p.rankFrom,
    rankTo: p.rankTo,
    prizeType: p.prizeType,
    polAmount: null,
    blkAmount: null,
    boostHashRate: p.boostHashRate ?? null,
    boostHours: p.boostHours ?? null,
    minerId: p.minerId ?? null,
    minerCount: 1,
    miner: p.minerId != null ? (byId.get(p.minerId) ?? null) : null,
  }));
}

async function liveScores(def: PreviewDef, startsAt: Date, endsAt: Date): Promise<Map<number, number>> {
  const now = new Date();
  const upper = endsAt < now ? endsAt : now;
  if (def.metric === "TASKS_COMPLETED") {
    const rows = await prisma.userDailyTaskProgress.groupBy({
      by: ["userId"],
      where: { rewardClaimedAt: { gte: startsAt, lt: upper } },
      _count: { id: true },
    });
    return new Map(rows.map((r) => [r.userId, Number(r._count.id ?? 0)]));
  }
  registerTournamentMetricScorers();
  const scorer = getMetricScorer(def.metric);
  if (!scorer) return new Map();
  const record = { id: 0, name: def.name, metric: def.metric, startsAt, endsAt, status: "ACTIVE" };
  const scores = await scorer.reconcile(record, { startsAt, endsAt: upper });
  return new Map([...scores.entries()].map(([userId, b]) => [userId, b.total]));
}

async function buildPreview(def: PreviewDef, now = new Date()) {
  const window = snapWindowForType(def.type, now)!;
  const startsAt: Date = window.start;
  const endsAt: Date = window.end;
  const scores = await liveScores(def, startsAt, endsAt);
  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const tournament = {
    id: previewTournamentId(def.metric, def.type),
    name: def.name,
    description: def.description,
    type: def.type,
    metric: def.metric,
    metricConfig: null,
    startsAt,
    endsAt,
    status: "ACTIVE" as const,
    recurring: true,
    scoresReconciledAt: now,
    version: 0,
    createdAt: startsAt,
    updatedAt: now,
    preview: true,
    prizes: await buildPrizes(def.type),
    _count: { entries: ranked.length },
    windowUtc: formatUtcWindowLabel(startsAt, endsAt),
    windowUtcNow: formatUtcWindowLabel(startsAt, endsAt < now ? endsAt : now),
  };
  return { tournament, ranked };
}

export async function listPreviewTournaments() {
  const defs = enabledDefs();
  const built = await Promise.all(defs.map((d) => buildPreview(d)));
  return built.map((b) => b.tournament);
}

export async function getPreviewTournamentWithLeaderboard(tournamentId: number, userId?: number) {
  const def = enabledDefs().find((d) => previewTournamentId(d.metric, d.type) === tournamentId);
  if (!def) return null;
  const { tournament, ranked } = await buildPreview(def);
  const topRows = ranked.slice(0, LEADERBOARD_LIMIT);
  const users = await prisma.user.findMany({
    where: { id: { in: topRows.map(([u]) => u) } },
    select: { id: true, username: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u]));
  const top = topRows.map(([uid, score], i) => ({
    id: -(i + 1),
    tournamentId,
    userId: uid,
    score,
    rank: i + 1,
    firstContributionAt: null,
    rewardGranted: false,
    user: nameById.get(uid) ?? { id: uid, username: `#${uid}` },
  }));

  let myEntry: { score: number; rank: number; rewardGranted: boolean } | null = null;
  let myRankLive: number | null = null;
  let myPrize: { prizeType: string } | null = null;
  if (userId) {
    const idx = ranked.findIndex(([u]) => u === userId);
    if (idx >= 0) {
      myRankLive = idx + 1;
      myEntry = { score: ranked[idx][1], rank: myRankLive, rewardGranted: false };
      const prize = tournament.prizes.find((p) => myRankLive! >= p.rankFrom && myRankLive! <= p.rankTo);
      if (prize) myPrize = { prizeType: prize.prizeType };
    }
  }

  return {
    offerwallRules: null,
    myOfferwallBreakdown: null,
    tournament,
    top,
    myEntry,
    myRankLive,
    myPrize,
    scoresComputedAt: new Date().toISOString(),
    myDepositBreakdown: null,
  };
}
