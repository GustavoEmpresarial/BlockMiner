/**
 * ETAPA B — move 3D miners from common rooms back to inventory.
 *
 * DRY-RUN IS THE DEFAULT. Without --execute, this only lists targets.
 *
 * Local dry-run:
 *   npx tsx --import ./tests/_env-test-overrides.mjs \
 *     scripts/audit/migrate-showcase-3d-from-common-rooms.mts
 *
 * Local execute (lab / dump on 127.0.0.1 only):
 *   npx tsx --import ./tests/_env-test-overrides.mjs \
 *     scripts/audit/migrate-showcase-3d-from-common-rooms.mts --execute
 *
 * Production: Deployador only, after review, with explicit authorization.
 * This script refuses blockminer-db and production IPs.
 */
import {
  assertSafeDatabaseUrl,
  runShowcase3dCommonRoomMigration,
  SHOWCASE_3D_COMMON_MIGRATE_SURVEY_COUNT,
} from "../../server/modules/rooms/rooms.showcaseCommonMigration.ts";
import prisma from "../../server/core/database/prisma.ts";

assertSafeDatabaseUrl(process.env.DATABASE_URL);

const args = new Set(process.argv.slice(2));
const execute = args.has("--execute");
const failAfterRaw = [...args].find((a) => a.startsWith("--fail-after="));
const failAfter = failAfterRaw ? Number(failAfterRaw.split("=")[1]) : null;
if (failAfterRaw && (!Number.isInteger(failAfter) || (failAfter as number) < 0)) {
  throw new Error("--fail-after=N requires a non-negative integer (test harness only)");
}

console.log(
  JSON.stringify(
    {
      mode: execute ? "EXECUTE" : "DRY_RUN",
      surveyCount: SHOWCASE_3D_COMMON_MIGRATE_SURVEY_COUNT,
      note: execute
        ? "Writes one transaction per machine via moveRackMinerBackToInventoryTx."
        : "No writes. Pass --execute to apply.",
    },
    null,
    2,
  ),
);

const result = await runShowcase3dCommonRoomMigration({
  execute,
  failAfter: failAfter == null ? null : failAfter,
});

console.log(JSON.stringify(result, null, 2));

if (result.aborted) {
  console.error(`ABORT: ${result.aborted}`);
  process.exitCode = 2;
} else if (!result.dryRun && result.failures.length > 0) {
  console.error(
    `FAIL: moved=${result.moved} planned=${result.planned} remaining=${result.remaining} failures=${result.failures.length}`,
  );
  process.exitCode = 1;
} else if (!result.dryRun && result.moved !== result.planned) {
  console.error(`FAIL: planned/moved mismatch planned=${result.planned} moved=${result.moved}`);
  process.exitCode = 1;
} else if (result.dryRun) {
  console.log(`DRY_RUN_OK planned=${result.planned} (nothing written)`);
} else {
  console.log(`EXECUTE_OK planned=${result.planned} moved=${result.moved} remaining=${result.remaining}`);
}

await prisma.$disconnect();
