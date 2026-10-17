/**
 * Seeds the new tournaments into the database:
 * - Queima (BURNS): Daily, Weekly, Monthly
 * - Forja (MERGES): Daily, Weekly, Monthly
 * - Tarefas (TASKS_COMPLETED): Weekly, Monthly
 *
 * Idempotent: checks if active tournament already exists before creating.
 * Recomputes live scores for existing or newly created tournaments.
 */
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

const PRIZES = {
  DAILY: [
    { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: MINER.cryptoDrill, minerCount: 1 },
    { rankFrom: 2, rankTo: 2, prizeType: "MACHINE", minerId: MINER.neonHash, minerCount: 1 },
    { rankFrom: 3, rankTo: 3, prizeType: "MACHINE", minerId: MINER.hashTitan, minerCount: 1 },
    { rankFrom: 4, rankTo: 10, prizeType: "MACHINE", minerId: MINER.quantumForge, minerCount: 1 },
    { rankFrom: 11, rankTo: 25, prizeType: "MINING_BOOST", boostHashRate: 150, boostHours: 24 },
  ],
  WEEKLY: [
    { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: MINER.ironPulse, minerCount: 1 },
    { rankFrom: 2, rankTo: 2, prizeType: "MACHINE", minerId: MINER.cryptoDrill, minerCount: 1 },
    { rankFrom: 3, rankTo: 3, prizeType: "MACHINE", minerId: MINER.neonHash, minerCount: 1 },
    { rankFrom: 4, rankTo: 10, prizeType: "MACHINE", minerId: MINER.hashTitan, minerCount: 1 },
    { rankFrom: 11, rankTo: 25, prizeType: "MINING_BOOST", boostHashRate: 400, boostHours: 168 },
  ],
  MONTHLY: [
    { rankFrom: 1, rankTo: 1, prizeType: "MACHINE", minerId: MINER.blackNova, minerCount: 1 },
    { rankFrom: 2, rankTo: 2, prizeType: "MACHINE", minerId: MINER.ironPulse, minerCount: 1 },
    { rankFrom: 3, rankTo: 3, prizeType: "MACHINE", minerId: MINER.cryptoDrill, minerCount: 1 },
    { rankFrom: 4, rankTo: 10, prizeType: "MACHINE", minerId: MINER.neonHash, minerCount: 1 },
    { rankFrom: 11, rankTo: 25, prizeType: "MINING_BOOST", boostHashRate: 500, boostHours: 168 },
  ],
};

const TOURNAMENT_SPECS = [
  // ─── Queima (BURNS) ────────────────────────────────────────────────────────
  {
    name: "Daily Burn Tournament",
    description: "Ranking diário por poder total (H/s) de máquinas destruídas em eventos de queima.",
    type: "DAILY",
    metric: "BURNS",
    startsAt: new Date("2026-10-11T00:00:00.000Z"),
    endsAt: new Date("2026-10-12T00:00:00.000Z"),
    prizes: PRIZES.DAILY,
  },
  {
    name: "Weekly Burn Tournament",
    description: "Ranking semanal por poder total (H/s) de máquinas destruídas em eventos de queima.",
    type: "WEEKLY",
    metric: "BURNS",
    startsAt: new Date("2026-10-05T00:00:00.000Z"),
    endsAt: new Date("2026-10-12T00:00:00.000Z"),
    prizes: PRIZES.WEEKLY,
  },
  {
    name: "Monthly Burn Tournament",
    description: "Ranking mensal por poder total (H/s) de máquinas destruídas em eventos de queima.",
    type: "MONTHLY",
    metric: "BURNS",
    startsAt: new Date("2026-10-01T00:00:00.000Z"),
    endsAt: new Date("2026-11-01T00:00:00.000Z"),
    prizes: PRIZES.MONTHLY,
  },

  // ─── Forja (MERGES) ────────────────────────────────────────────────────────
  {
    name: "Daily Forge Tournament",
    description: "Ranking diário por pontos de fusão conquistados na bancada de forja.",
    type: "DAILY",
    metric: "MERGES",
    startsAt: new Date("2026-10-11T00:00:00.000Z"),
    endsAt: new Date("2026-10-12T00:00:00.000Z"),
    prizes: PRIZES.DAILY,
  },
  {
    name: "Weekly Forge Tournament",
    description: "Ranking semanal por pontos de fusão conquistados na bancada de forja.",
    type: "WEEKLY",
    metric: "MERGES",
    startsAt: new Date("2026-10-05T00:00:00.000Z"),
    endsAt: new Date("2026-10-12T00:00:00.000Z"),
    prizes: PRIZES.WEEKLY,
  },
  {
    name: "Monthly Forge Tournament",
    description: "Ranking mensal por pontos de fusão conquistados na bancada de forja.",
    type: "MONTHLY",
    metric: "MERGES",
    startsAt: new Date("2026-10-01T00:00:00.000Z"),
    endsAt: new Date("2026-11-01T00:00:00.000Z"),
    prizes: PRIZES.MONTHLY,
  },

  // ─── Tarefas (TASKS_COMPLETED) ─────────────────────────────────────────────
  {
    name: "Weekly Tasks Tournament",
    description: "Ranking semanal por missões e objetivos diários concluídos e resgatados.",
    type: "WEEKLY",
    metric: "TASKS_COMPLETED",
    startsAt: new Date("2026-10-05T00:00:00.000Z"),
    endsAt: new Date("2026-10-12T00:00:00.000Z"),
    prizes: PRIZES.WEEKLY,
  },
  {
    name: "Monthly Tasks Tournament",
    description: "Ranking mensal por missões e objetivos diários concluídos e resgatados.",
    type: "MONTHLY",
    metric: "TASKS_COMPLETED",
    startsAt: new Date("2026-10-01T00:00:00.000Z"),
    endsAt: new Date("2026-11-01T00:00:00.000Z"),
    prizes: PRIZES.MONTHLY,
  },
];

async function main() {
  console.log("Checking and seeding new tournaments (BURNS, MERGES, TASKS_COMPLETED)...");

  for (const spec of TOURNAMENT_SPECS) {
    const existing = await prisma.tournament.findFirst({
      where: {
        metric: spec.metric,
        type: spec.type,
        status: "ACTIVE",
      },
    });

    if (existing) {
      console.log(`Tournament already active: #${existing.id} "${existing.name}" (${existing.metric} ${existing.type})`);
      await computeScoresForTournament(existing);
      continue;
    }

    const created = await prisma.tournament.create({
      data: {
        name: spec.name,
        description: spec.description,
        type: spec.type,
        metric: spec.metric,
        startsAt: spec.startsAt,
        endsAt: spec.endsAt,
        recurring: true,
        status: "ACTIVE",
        prizes: {
          create: spec.prizes.map((p) => ({
            rankFrom: p.rankFrom,
            rankTo: p.rankTo,
            prizeType: p.prizeType,
            minerId: p.minerId ?? null,
            minerCount: p.minerCount ?? null,
            boostHashRate: p.boostHashRate ?? null,
            boostHours: p.boostHours ?? null,
          })),
        },
      },
    });

    console.log(`Created tournament #${created.id} "${created.name}" (${created.metric} ${created.type})`);
    await computeScoresForTournament(created);
  }

  console.log("All new tournaments successfully seeded and computed!");
}

main()
  .catch((e) => {
    console.error("Error seeding new tournaments:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
