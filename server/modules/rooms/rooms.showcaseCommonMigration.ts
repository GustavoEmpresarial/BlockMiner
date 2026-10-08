/**
 * Etapa B — move 3D miners out of common rooms (1–ROOM_MAX) back to inventory.
 * Dry-run is the default. Live writes require an explicit execute flag.
 */
import prisma from "../../core/database/prisma.js";
import { isShowcase3dMiner, isShowcaseRoom } from "./rooms.showcase.js";
import { ROOM_MAX } from "./rooms.types.js";

/** Deployador survey (2026-10-08). Abort if live count exceeds survey × multiplier. Not the migrate quota. */
export const SHOWCASE_3D_COMMON_MIGRATE_SURVEY_COUNT = 30;
export const SHOWCASE_3D_COMMON_MIGRATE_ABORT_MULTIPLIER = 2;

export const SHOWCASE_3D_COMMON_MIGRATE_AUDIT_ACTION = "SHOWCASE_3D_COMMON_ROOM_MIGRATE_TO_INVENTORY";

export type Showcase3dCommonHit = {
  userId: number;
  roomNumber: number;
  rackId: number;
  minerId: number;
  hashRate: number;
  label: string;
};

export function assertSafeDatabaseUrl(raw: string | undefined | null): void {
  if (!raw?.trim()) throw new Error("DATABASE_URL missing");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL unparseable");
  }
  const host = parsed.hostname;
  const db = parsed.pathname.replace(/^\//, "");
  const refused =
    raw.includes("blockminer-db") ||
    raw.includes("blockminer.space") ||
    raw.includes("89.167.119.164") ||
    raw.includes("169.58.45.155") ||
    raw.includes("161.97.176.125") ||
    !["127.0.0.1", "localhost"].includes(host);
  if (refused) {
    throw new Error(
      `DATABASE_URL refused (host=${host} db=${db}). Use localhost or a local dump only.`,
    );
  }
}

export function minerRefFromInstalled(row: {
  imageUrl: string | null;
  miner: { name: string | null; imageUrl: string | null } | null;
  ownedMachine: {
    minerName: string | null;
    imageUrl: string | null;
    eventMiner: { name: string | null; imageUrl: string | null; modelUrl: string | null } | null;
  } | null;
}) {
  const eventMiner = row.ownedMachine?.eventMiner;
  return {
    modelUrl: eventMiner?.modelUrl ?? null,
    minerName: eventMiner?.name ?? row.ownedMachine?.minerName ?? row.miner?.name ?? null,
    imageUrl:
      row.imageUrl ??
      row.ownedMachine?.imageUrl ??
      eventMiner?.imageUrl ??
      row.miner?.imageUrl ??
      null,
  };
}

/** Live count of 3D miners on standard rooms. Never uses a hard-coded total. */
export async function listShowcase3dInCommonRooms(): Promise<Showcase3dCommonHit[]> {
  const racks = await prisma.userRack.findMany({
    where: {
      userMinerId: { not: null },
      room: {
        roomNumber: { gte: 1, lte: ROOM_MAX },
      },
    },
    select: {
      id: true,
      userId: true,
      position: true,
      room: { select: { roomNumber: true, kind: true } },
      userMiner: {
        select: {
          id: true,
          hashRate: true,
          imageUrl: true,
          miner: { select: { name: true, imageUrl: true } },
          ownedMachine: {
            select: {
              minerName: true,
              imageUrl: true,
              eventMiner: { select: { name: true, imageUrl: true, modelUrl: true } },
            },
          },
        },
      },
    },
  });

  const hits: Showcase3dCommonHit[] = [];
  for (const rack of racks) {
    if (!rack.userMiner) continue;
    if (isShowcaseRoom(rack.room)) continue;
    const ref = minerRefFromInstalled(rack.userMiner);
    if (!isShowcase3dMiner(ref)) continue;
    hits.push({
      userId: rack.userId,
      roomNumber: rack.room.roomNumber,
      rackId: rack.id,
      minerId: rack.userMiner.id,
      hashRate: Number(rack.userMiner.hashRate) || 0,
      label: String(ref.minerName ?? ref.imageUrl ?? "3d"),
    });
  }
  return hits;
}

export function summarizeShowcase3dCommonHits(hits: Showcase3dCommonHit[]) {
  const byUser = new Map<number, { count: number; hashRate: number }>();
  for (const hit of hits) {
    const cur = byUser.get(hit.userId) ?? { count: 0, hashRate: 0 };
    cur.count += 1;
    cur.hashRate += hit.hashRate;
    byUser.set(hit.userId, cur);
  }
  const userStats = [...byUser.entries()]
    .map(([userId, stats]) => ({ userId, ...stats }))
    .sort((a, b) => b.count - a.count || b.hashRate - a.hashRate);
  const totalHashRate = hits.reduce((sum, h) => sum + h.hashRate, 0);
  const worst = userStats[0] ?? null;
  return {
    roomMax: ROOM_MAX,
    machines3dInCommonRooms: hits.length,
    distinctUsers: byUser.size,
    totalHashRate,
    worstUser: worst
      ? { userId: worst.userId, machines: worst.count, hashRate: worst.hashRate }
      : null,
    distributionTop10: userStats.slice(0, 10),
  };
}

export type MigrateShowcase3dCommonOptions = {
  /** When false (default), only list. */
  execute?: boolean;
  /** Survey baseline for abort threshold. Default 30. */
  surveyCount?: number;
  /** Abort when live count > survey × multiplier. Default 2. */
  abortMultiplier?: number;
  /** Test-only: throw after N successful moves (that Nth move commits; next throws before work). */
  failAfter?: number | null;
  /** Injected mover — defaults to rooms.service helper. */
  moveOne?: (
    hit: Showcase3dCommonHit,
  ) => Promise<{ minerName: string; skipped?: boolean }>;
};

export type MigrateShowcase3dCommonResult = {
  dryRun: boolean;
  planned: number;
  moved: number;
  remaining: number;
  aborted?: string;
  failures: Array<{ rackId: number; userId: number; error: string }>;
  summaryBefore: ReturnType<typeof summarizeShowcase3dCommonHits>;
  summaryAfter: ReturnType<typeof summarizeShowcase3dCommonHits>;
};

export async function runShowcase3dCommonRoomMigration(
  options: MigrateShowcase3dCommonOptions = {},
): Promise<MigrateShowcase3dCommonResult> {
  const execute = options.execute === true;
  const surveyCount = options.surveyCount ?? SHOWCASE_3D_COMMON_MIGRATE_SURVEY_COUNT;
  const abortMultiplier = options.abortMultiplier ?? SHOWCASE_3D_COMMON_MIGRATE_ABORT_MULTIPLIER;
  const failAfter = options.failAfter ?? null;

  const beforeHits = await listShowcase3dInCommonRooms();
  const summaryBefore = summarizeShowcase3dCommonHits(beforeHits);
  const planned = beforeHits.length;
  const abortAt = surveyCount * abortMultiplier;

  if (planned > abortAt) {
    return {
      dryRun: !execute,
      planned,
      moved: 0,
      remaining: planned,
      aborted: `live count ${planned} exceeds abort threshold ${abortAt} (survey ${surveyCount} × ${abortMultiplier}). Confirm human before retry.`,
      failures: [],
      summaryBefore,
      summaryAfter: summaryBefore,
    };
  }

  if (!execute) {
    return {
      dryRun: true,
      planned,
      moved: 0,
      remaining: planned,
      failures: [],
      summaryBefore,
      summaryAfter: summaryBefore,
    };
  }

  const { migrateShowcase3dCommonRackToInventory } = await import("./rooms.service.js");
  const moveOne =
    options.moveOne ??
    ((hit: Showcase3dCommonHit) =>
      migrateShowcase3dCommonRackToInventory({ userId: hit.userId, rackId: hit.rackId }));

  let moved = 0;
  const failures: MigrateShowcase3dCommonResult["failures"] = [];

  for (const hit of beforeHits) {
    if (failAfter != null && moved >= failAfter) {
      failures.push({
        rackId: hit.rackId,
        userId: hit.userId,
        error: `injected failure after ${failAfter} successful moves`,
      });
      break;
    }
    try {
      const outcome = await moveOne(hit);
      if (outcome.skipped) {
        // Already gone (idempotent race). Does not count as a write.
        continue;
      }
      moved += 1;
    } catch (err) {
      failures.push({
        rackId: hit.rackId,
        userId: hit.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const afterHits = await listShowcase3dInCommonRooms();
  const summaryAfter = summarizeShowcase3dCommonHits(afterHits);
  const remaining = afterHits.length;

  if (failures.length === 0 && moved !== planned) {
    throw new Error(
      `migrate count mismatch: planned=${planned} moved=${moved} remaining=${remaining}. Refusing silent success.`,
    );
  }
  if (failures.length === 0 && remaining !== 0) {
    throw new Error(
      `migrate incomplete without failures: planned=${planned} moved=${moved} remaining=${remaining}.`,
    );
  }
  if (failures.length > 0 && moved + remaining !== planned) {
    throw new Error(
      `migrate lost track of machines: planned=${planned} moved=${moved} remaining=${remaining} failures=${failures.length}.`,
    );
  }

  return {
    dryRun: false,
    planned,
    moved,
    remaining,
    failures,
    summaryBefore,
    summaryAfter,
  };
}
