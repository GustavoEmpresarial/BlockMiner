/**
 * Task catalog v2: daily / weekly / monthly tasks with low rewards.
 *
 * Rows are written with isActive=false and a `v2-` slug: production ignores them, and the dev
 * VM (TASKS_PREVIEW_CATALOG=1) uses exactly these rows as its catalog. Going live later means
 * flipping isActive on these rows and the old ones off — no data migration.
 *
 * Reward policy (1 BLK ≈ 1 USD): cash BLK only in small amounts, everything else is temporary
 * hashrate. A player clearing every daily task earns at most 0.01 BLK per day.
 * Idempotent: upsert by slug.
 */
import prisma from "../server/core/database/prisma.js";

const BLK = (amount) => ({ rewardKind: "BLK", rewardBlkAmount: String(amount) });
const BOOST = (hashRate, days) => ({ rewardKind: "HASHRATE_TEMP", rewardHashRate: hashRate, rewardHashRateDays: days });

const TASKS = [
  // ── Daily ────────────────────────────────────────────────────────────────
  { slug: "v2-daily-checkin", taskType: "LOGIN_DAY", resetCadence: "DAILY", targetValue: 1, key: "checkin", ...BOOST(100, 1) },
  { slug: "v2-daily-faucet", taskType: "CLAIM_FAUCET", resetCadence: "DAILY", targetValue: 1, key: "faucet", ...BOOST(100, 1) },
  { slug: "v2-daily-youtube", taskType: "WATCH_YOUTUBE", resetCadence: "DAILY", targetValue: 3, key: "watch_youtube", ...BOOST(150, 1) },
  { slug: "v2-daily-games", taskType: "PLAY_GAMES", resetCadence: "DAILY", targetValue: 2, key: "play_games", ...BOOST(150, 1) },
  { slug: "v2-daily-shortlinks", taskType: "COMPLETE_SHORTLINKS", resetCadence: "DAILY", targetValue: 2, key: "shortlinks", ...BOOST(200, 1) },
  { slug: "v2-daily-offers", taskType: "COMPLETE_OFFERS", resetCadence: "DAILY", targetValue: 3, key: "offers", ...BLK(0.005) },
  { slug: "v2-daily-auto-mining", taskType: "AUTO_MINING_CLAIMS", resetCadence: "DAILY", targetValue: 10, key: "auto_mining", ...BOOST(150, 1) },
  { slug: "v2-daily-mine-blk", taskType: "MINE_BLK", resetCadence: "DAILY", targetValue: 0.02, key: "mine_blk", ...BLK(0.005) },

  // ── Weekly ───────────────────────────────────────────────────────────────
  { slug: "v2-weekly-checkin", taskType: "LOGIN_DAY", resetCadence: "WEEKLY", targetValue: 5, key: "checkin", ...BOOST(400, 3) },
  { slug: "v2-weekly-youtube", taskType: "WATCH_YOUTUBE", resetCadence: "WEEKLY", targetValue: 25, key: "watch_youtube", ...BOOST(500, 3) },
  { slug: "v2-weekly-games", taskType: "PLAY_GAMES", resetCadence: "WEEKLY", targetValue: 15, key: "play_games", ...BOOST(500, 3) },
  { slug: "v2-weekly-offers", taskType: "COMPLETE_OFFERS", resetCadence: "WEEKLY", targetValue: 20, key: "offers", ...BLK(0.02) },
  { slug: "v2-weekly-shortlinks", taskType: "COMPLETE_SHORTLINKS", resetCadence: "WEEKLY", targetValue: 15, key: "shortlinks", ...BOOST(600, 3) },
  { slug: "v2-weekly-merge", taskType: "MERGE_MACHINES", resetCadence: "WEEKLY", targetValue: 1, key: "merge", ...BOOST(750, 3) },
  { slug: "v2-weekly-burn", taskType: "BURN_CLAIMS", resetCadence: "WEEKLY", targetValue: 1, key: "burn", ...BOOST(750, 3) },

  // ── Monthly ──────────────────────────────────────────────────────────────
  { slug: "v2-monthly-checkin", taskType: "LOGIN_DAY", resetCadence: "MONTHLY", targetValue: 20, key: "checkin", ...BOOST(1500, 7) },
  { slug: "v2-monthly-offers", taskType: "COMPLETE_OFFERS", resetCadence: "MONTHLY", targetValue: 80, key: "offers", ...BLK(0.1) },
  { slug: "v2-monthly-youtube", taskType: "WATCH_YOUTUBE", resetCadence: "MONTHLY", targetValue: 100, key: "watch_youtube", ...BOOST(1500, 7) },
  { slug: "v2-monthly-merge", taskType: "MERGE_MACHINES", resetCadence: "MONTHLY", targetValue: 5, key: "merge", ...BOOST(2000, 7) },
  { slug: "v2-monthly-referrals", taskType: "QUALIFIED_REFERRALS", resetCadence: "MONTHLY", targetValue: 1, key: "referrals", ...BOOST(2000, 7) },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const [i, t] of TASKS.entries()) {
    const data = {
      taskType: t.taskType,
      resetCadence: t.resetCadence,
      targetValue: String(t.targetValue),
      translationKey: `dailyTasks.tasks.${t.key}`,
      rewardKind: t.rewardKind,
      rewardBlkAmount: t.rewardBlkAmount ?? null,
      rewardPolAmount: null,
      rewardHashRate: t.rewardHashRate ?? null,
      rewardHashRateDays: t.rewardHashRateDays ?? null,
      rewardMinerId: null,
      rewardEventMinerId: null,
      gameSlug: null,
      internalOfferwallOfferId: null,
      sortOrder: 1000 + i * 10,
      isActive: false,
    };
    const existing = await prisma.dailyTaskDefinition.findUnique({ where: { slug: t.slug } });
    if (existing) {
      await prisma.dailyTaskDefinition.update({ where: { slug: t.slug }, data });
      updated += 1;
    } else {
      await prisma.dailyTaskDefinition.create({ data: { slug: t.slug, ...data } });
      created += 1;
    }
  }
  console.log(`task catalog v2: ${created} created, ${updated} updated (all isActive=false)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
