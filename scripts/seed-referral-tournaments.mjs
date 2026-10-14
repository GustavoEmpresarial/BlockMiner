import prisma from "../server/core/database/prisma.js";
import { computeScoresForTournament } from "../server/modules/tournaments/tournaments.service.js";

const MINER = {
  quantumForge: 209,
  titanCore: 210,
  hashTitan: 10,
  neonHash: 211,
  cryptoDrill: 30,
  blockForgePro: 11,
  ironPulse: 212,
  novaHashCore: 31,
  blackNova: 213,
  quantumMineZX: 32,
  hyperDrill: 214,
};

async function main() {
  console.log("Checking existing active REFERRALS tournaments...");
  const existing = await prisma.tournament.findMany({
    where: { metric: "REFERRALS", status: "ACTIVE" },
  });

  if (existing.length > 0) {
    console.log(`Found ${existing.length} active REFERRALS tournaments:`, existing.map((t) => `#${t.id} ${t.name}`));
    for (const t of existing) {
      console.log(`Recomputing scores for #${t.id} ${t.name}...`);
      await computeScoresForTournament(t);
    }
    return;
  }

  console.log("Creating Daily, Weekly, and Monthly Referral Tournaments...");

  const daily = await prisma.tournament.create({
    data: {
      name: "Daily Referral Tournament",
      description: "Ranking diário por amigos indicados que se qualificaram (e-mail verificado + atividade confirmada no jogo).",
      type: "DAILY",
      metric: "REFERRALS",
      startsAt: new Date("2026-10-10T00:00:00.000Z"),
      endsAt: new Date("2026-10-11T00:00:00.000Z"),
      recurring: true,
      status: "ACTIVE",
      prizes: {
        create: [
          { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: MINER.cryptoDrill, minerCount: 1 },
          { rankFrom: 2, rankTo: 2, prizeType: "MACHINE", minerId: MINER.neonHash, minerCount: 1 },
          { rankFrom: 3, rankTo: 3, prizeType: "MACHINE", minerId: MINER.hashTitan, minerCount: 1 },
          { rankFrom: 4, rankTo: 10, prizeType: "MACHINE", minerId: MINER.quantumForge, minerCount: 1 },
          { rankFrom: 11, rankTo: 25, prizeType: "MINING_BOOST", boostHashRate: 150, boostHours: 24 },
        ],
      },
    },
  });
  console.log(`Created Daily Referral Tournament #${daily.id}`);

  const weekly = await prisma.tournament.create({
    data: {
      name: "Weekly Referral Tournament",
      description: "Ranking semanal por amigos indicados que se qualificaram (e-mail verificado + atividade confirmada no jogo).",
      type: "WEEKLY",
      metric: "REFERRALS",
      startsAt: new Date("2026-10-04T00:00:00.000Z"),
      endsAt: new Date("2026-10-11T00:00:00.000Z"),
      recurring: true,
      status: "ACTIVE",
      prizes: {
        create: [
          { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: MINER.ironPulse, minerCount: 1 },
          { rankFrom: 2, rankTo: 2, prizeType: "MACHINE", minerId: MINER.cryptoDrill, minerCount: 1 },
          { rankFrom: 3, rankTo: 3, prizeType: "MACHINE", minerId: MINER.neonHash, minerCount: 1 },
          { rankFrom: 4, rankTo: 10, prizeType: "MACHINE", minerId: MINER.hashTitan, minerCount: 1 },
          { rankFrom: 11, rankTo: 25, prizeType: "MINING_BOOST", boostHashRate: 400, boostHours: 168 },
        ],
      },
    },
  });
  console.log(`Created Weekly Referral Tournament #${weekly.id}`);

  const monthly = await prisma.tournament.create({
    data: {
      name: "Monthly Referral Tournament",
      description: "Ranking mensal por amigos indicados que se qualificaram (e-mail verificado + atividade confirmada no jogo).",
      type: "MONTHLY",
      metric: "REFERRALS",
      startsAt: new Date("2026-10-01T00:00:00.000Z"),
      endsAt: new Date("2026-11-01T00:00:00.000Z"),
      recurring: true,
      status: "ACTIVE",
      prizes: {
        create: [
          { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: MINER.blackNova, minerCount: 1 },
          { rankFrom: 2, rankTo: 2, prizeType: "MACHINE", minerId: MINER.ironPulse, minerCount: 1 },
          { rankFrom: 3, rankTo: 3, prizeType: "MACHINE", minerId: MINER.cryptoDrill, minerCount: 1 },
          { rankFrom: 4, rankTo: 10, prizeType: "MACHINE", minerId: MINER.neonHash, minerCount: 1 },
          { rankFrom: 11, rankTo: 25, prizeType: "MINING_BOOST", boostHashRate: 500, boostHours: 168 },
        ],
      },
    },
  });
  console.log(`Created Monthly Referral Tournament #${monthly.id}`);

  console.log("Seeding done!");
}

main()
  .catch((e) => {
    console.error("Error seeding referral tournaments:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
