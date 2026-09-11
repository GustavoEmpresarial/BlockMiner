/**
 * One-shot: retune ACTIVE tournament prizes + ensure engagement dailies exist.
 * Run inside app container (cwd /app):
 *   node apply-portfolio-prizes.mjs
 *
 * Does not recompute scores (call admin reconcile / getTournament separately).
 */
import prisma from "./dist/server/core/database/prisma.js";

const MINER = {
  quantumForge: 209,
  titanCore: 210,
  hashTitan: 10,
  neonHash: 211,
  cryptoDrill: 30,
  ironPulse: 212,
  blackNova: 213,
  hyperDrill: 214,
};

function machine(rankFrom, rankTo, minerId, minerCount = 1) {
  return { rankFrom, rankTo, prizeType: "MACHINE", minerId, minerCount };
}
function blk(rankFrom, rankTo, amount) {
  return { rankFrom, rankTo, prizeType: "BLK", blkAmount: amount };
}
function pol(rankFrom, rankTo, amount) {
  return { rankFrom, rankTo, prizeType: "POL", polAmount: amount };
}
function boost(rankFrom, rankTo, hashRate, hours) {
  return {
    rankFrom,
    rankTo,
    prizeType: "MINING_BOOST",
    boostHashRate: hashRate,
    boostHours: hours,
  };
}

const LADDERS = {
  "Daily Offerwall Tournament::DAILY::OFFERS_ALL": [
    machine(1, 1, MINER.neonHash),
    machine(2, 3, MINER.hashTitan),
    machine(4, 10, MINER.quantumForge),
    blk(11, 25, 5),
  ],
  "Weekly Offerwall Tournament::WEEKLY::OFFERS_ALL": [
    machine(1, 1, MINER.cryptoDrill),
    machine(2, 2, MINER.neonHash),
    machine(3, 3, MINER.hashTitan),
    machine(4, 10, MINER.quantumForge),
  ],
  "Monthly Offerwall Tournament::MONTHLY::OFFERS_EXTERNAL": [
    machine(1, 1, MINER.blackNova),
    machine(2, 3, MINER.ironPulse),
    machine(4, 10, MINER.cryptoDrill),
  ],
  "Weekly Deposit Tournament::WEEKLY::DEPOSITS_USD": [
    machine(1, 1, MINER.hyperDrill),
    machine(2, 2, MINER.blackNova),
    machine(3, 3, MINER.ironPulse, 2),
    pol(4, 5, 0.3),
  ],
  "Daily Game Tournament::DAILY::MINIGAME_WINS": [
    machine(1, 1, MINER.cryptoDrill),
    machine(2, 2, MINER.neonHash),
    machine(3, 3, MINER.hashTitan),
    machine(4, 10, MINER.quantumForge),
    boost(11, 20, 10, 6),
  ],
  "Daily Faucet Tournament::DAILY::FAUCET": [
    blk(1, 1, 25),
    blk(2, 3, 10),
    blk(4, 10, 3),
  ],
  "Daily Shortlink Tournament::DAILY::SHORTLINK": [
    machine(1, 1, MINER.titanCore),
    blk(2, 5, 5),
    blk(6, 15, 1),
  ],
  "Daily Auto-Mining Tournament::DAILY::AUTO_MINING": [
    machine(1, 1, MINER.hashTitan),
    boost(2, 3, 15, 12),
    blk(4, 10, 2),
  ],
};

function seriesKey(t) {
  return `${t.name}::${t.type}::${t.metric}`;
}

function utcDayWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function replacePrizes(tournamentId, prizes) {
  await prisma.tournamentPrize.deleteMany({ where: { tournamentId } });
  await prisma.tournamentPrize.createMany({
    data: prizes.map((p) => ({
      tournamentId,
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
  });
}

async function ensureDailySeries(name, metric, prizes) {
  const existing = await prisma.tournament.findFirst({
    where: {
      name,
      metric,
      type: "DAILY",
      status: { in: ["ACTIVE", "SCHEDULED"] },
    },
  });
  if (existing) {
    await replacePrizes(existing.id, prizes);
    console.log(`[ok] retuned existing #${existing.id} ${name}`);
    return existing.id;
  }
  const { start, end } = utcDayWindow();
  const created = await prisma.tournament.create({
    data: {
      name,
      description:
        metric === "SHORTLINK"
          ? "Daily ranking by shortlink rewards claimed."
          : "Daily ranking by auto-mining claims.",
      type: "DAILY",
      metric,
      startsAt: start,
      endsAt: end,
      recurring: true,
      status: start <= new Date() ? "ACTIVE" : "SCHEDULED",
      prizes: {
        create: prizes.map((p) => ({
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
  });
  console.log(`[ok] created #${created.id} ${name} ${created.status}`);
  return created.id;
}

async function main() {
  const active = await prisma.tournament.findMany({
    where: { status: { in: ["ACTIVE", "SCHEDULED"] } },
  });

  for (const t of active) {
    const key = seriesKey(t);
    const ladder = LADDERS[key];
    if (!ladder) continue;
    await replacePrizes(t.id, ladder);
    console.log(`[ok] retuned #${t.id} ${key}`);
  }

  await ensureDailySeries(
    "Daily Shortlink Tournament",
    "SHORTLINK",
    LADDERS["Daily Shortlink Tournament::DAILY::SHORTLINK"],
  );
  await ensureDailySeries(
    "Daily Auto-Mining Tournament",
    "AUTO_MINING",
    LADDERS["Daily Auto-Mining Tournament::DAILY::AUTO_MINING"],
  );

  const summary = await prisma.tournament.findMany({
    where: { status: "ACTIVE" },
    orderBy: { id: "asc" },
    include: { _count: { select: { entries: true } }, prizes: { orderBy: { rankFrom: "asc" } } },
  });
  for (const t of summary) {
    console.log(
      `ACTIVE #${t.id} ${t.name} ${t.metric} entries=${t._count.entries} prizes=${t.prizes.length}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
