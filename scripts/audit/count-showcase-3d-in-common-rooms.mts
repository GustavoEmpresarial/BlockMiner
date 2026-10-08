/**
 * ETAPA A — read-only count of 3D miners installed in standard rooms (1–ROOM_MAX).
 *
 * Uses the same isShowcase3dMiner() predicate as install. Never writes.
 * Refuses production hostnames / blockminer-db.
 *
 * Local:
 *   npx tsx --import ./tests/_env-test-overrides.mjs scripts/audit/count-showcase-3d-in-common-rooms.mts
 */
import prisma from "../../server/core/database/prisma.ts";
import {
  assertSafeDatabaseUrl,
  listShowcase3dInCommonRooms,
  summarizeShowcase3dCommonHits,
} from "../../server/modules/rooms/rooms.showcaseCommonMigration.ts";

assertSafeDatabaseUrl(process.env.DATABASE_URL);

const hits = await listShowcase3dInCommonRooms();
const report = { readOnly: true, ...summarizeShowcase3dCommonHits(hits) };
console.log(JSON.stringify(report, null, 2));
await prisma.$disconnect();
