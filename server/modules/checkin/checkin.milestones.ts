/**
 * Ported from legacy/server/modules/checkin/checkin.milestoneRules.ts +
 * checkin.rewards.ts, merged into one file per the Fase 4 plan
 * ("checkin.milestones.ts").
 *
 * Reward delivery: milestone rewards (POL credit, temporary power grant, machine grant) are
 * delivered via notifications/index.ts's `createRewardInboxEntry` (the reward-inbox module,
 * same mechanism tasks/ and youtube/ use) — the user later "collects" the inbox entry through
 * reward-inbox's own claim flow, which is what actually credits wallet/inventory/boosts. This
 * module never mutates wallet balances directly.
 * The full business invariant that matters most for check-in itself is preserved: a milestone
 * is claimed exactly once per user (`UserCheckinStreakReward` unique on [userId, milestoneId],
 * inserted inside the same transaction as the streak read that granted it, and the same
 * transaction that writes the reward-inbox entry) — so re-running `applyStreakMilestoneRewards`
 * is always idempotent and never double-grants.
 */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { createRewardInboxEntry } from "../notifications/index.js";
import { computeCheckinStreak } from "./checkin.streak.js";

const log = logger.child("checkin.milestones");

export const REWARD_POL = "pol";
export const REWARD_TEMPORARY_POWER = "temporary_power";
export const REWARD_MACHINE = "machine";

/** Legacy DB value — normalized to {@link REWARD_TEMPORARY_POWER}. */
export const LEGACY_REWARD_HASHRATE = "hashrate";

export const ALLOWED_MILESTONE_REWARD_TYPES = new Set<string>([
  REWARD_POL,
  REWARD_TEMPORARY_POWER,
  REWARD_MACHINE,
]);

const DISALLOWED_RAW_REWARD_TYPES = new Set<string>(["item", "stelar", "zer", "none", "ticket"]);

export type MilestoneMetadata = { durationHours?: number };

export type ParsedMilestoneInput = {
  dayThreshold: number;
  rewardType: string;
  rewardValue: Prisma.Decimal;
  validityDays: number;
  displayTitle: null;
  description: null;
  active: boolean;
  sortOrder: number;
  minerId: number | null;
  itemCode: null;
  metadataJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
};

export function normalizeMilestoneRewardType(raw: string): string {
  const t = String(raw || "").trim().toLowerCase();
  if (t === "balance") return REWARD_POL;
  if (t === LEGACY_REWARD_HASHRATE) return REWARD_TEMPORARY_POWER;
  if (t === "zer") return "stelar";
  return t;
}

export function isAllowedMilestoneRewardType(raw: string): boolean {
  return ALLOWED_MILESTONE_REWARD_TYPES.has(normalizeMilestoneRewardType(raw));
}

export function isInvalidLegacyMilestoneRewardType(raw: string): boolean {
  const t = String(raw || "").trim().toLowerCase();
  if (DISALLOWED_RAW_REWARD_TYPES.has(t)) return true;
  if (t === LEGACY_REWARD_HASHRATE || t === "balance") return false;
  return !isAllowedMilestoneRewardType(t);
}

export function readDurationHours(validityDays: number, metadataJson: Prisma.JsonValue | null | undefined): number {
  const meta =
    metadataJson && typeof metadataJson === "object" && !Array.isArray(metadataJson)
      ? (metadataJson as MilestoneMetadata)
      : {};
  const hours = Number(meta.durationHours);
  if (Number.isFinite(hours) && hours > 0) return Math.min(24 * 365, Math.floor(hours));
  const days = Math.max(1, Number(validityDays) || 1);
  return days * 24;
}

function parseMetadata(durationHours: number | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (durationHours == null || !Number.isFinite(durationHours) || durationHours <= 0) {
    return Prisma.DbNull;
  }
  return { durationHours: Math.floor(durationHours) };
}

type MilestoneBody = {
  dayThreshold?: unknown;
  rewardType?: unknown;
  rewardValue?: unknown;
  validityDays?: unknown;
  durationHours?: unknown;
  active?: unknown;
  sortOrder?: unknown;
  minerId?: unknown;
  itemCode?: unknown;
};

export function parseMilestoneBody(body: unknown): ParsedMilestoneInput {
  const b = typeof body === "object" && body !== null ? (body as MilestoneBody) : {};
  const dayThreshold = Number(b.dayThreshold);
  if (!Number.isInteger(dayThreshold) || dayThreshold < 1) {
    throw new Error("dayThreshold must be a positive integer.");
  }

  const rewardType = normalizeMilestoneRewardType(String(b.rewardType ?? ""));
  if (!ALLOWED_MILESTONE_REWARD_TYPES.has(rewardType)) {
    throw new Error("rewardType must be pol, temporary_power, or machine.");
  }

  const rewardValue = Number(b.rewardValue ?? 0);
  if (!(rewardValue >= 0) || !Number.isFinite(rewardValue)) {
    throw new Error("rewardValue must be a non-negative number.");
  }

  const minerIdRaw = b.minerId;
  const minerId =
    minerIdRaw === undefined || minerIdRaw === null || minerIdRaw === "" ? null : Number(minerIdRaw);
  if (minerId != null && (!Number.isInteger(minerId) || minerId < 1)) {
    throw new Error("minerId must be a positive integer when provided.");
  }

  if (b.itemCode != null && String(b.itemCode).trim() !== "") {
    throw new Error("itemCode is not allowed for check-in milestones.");
  }

  let durationHours: number | null = null;
  let validityDays = 1;

  if (rewardType === REWARD_POL) {
    if (!(rewardValue > 0)) throw new Error("POL milestone requires rewardValue > 0.");
    if (minerId != null) throw new Error("POL milestone cannot include minerId.");
  } else if (rewardType === REWARD_TEMPORARY_POWER) {
    durationHours = Number(b.durationHours ?? 0);
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      const fallbackDays = Math.max(1, Number(b.validityDays ?? 0));
      durationHours = fallbackDays > 0 ? fallbackDays * 24 : 0;
    }
    if (!(durationHours > 0)) {
      throw new Error("temporary_power milestone requires durationHours > 0.");
    }
    if (!(rewardValue > 0)) {
      throw new Error("temporary_power milestone requires power amount (rewardValue) > 0.");
    }
    if (minerId != null) throw new Error("temporary_power milestone cannot include minerId.");
    validityDays = Math.max(1, Math.ceil(durationHours / 24));
  } else if (rewardType === REWARD_MACHINE) {
    if (!minerId) throw new Error("machine milestone requires minerId from catalog.");
    validityDays = 1;
    durationHours = null;
  }

  const active = b.active !== false;
  const sortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;

  return {
    dayThreshold,
    rewardType,
    rewardValue: new Prisma.Decimal(String(rewardValue)),
    validityDays,
    displayTitle: null,
    description: null,
    active,
    sortOrder,
    minerId,
    itemCode: null,
    metadataJson: parseMetadata(durationHours),
  };
}

export async function assertMinerExistsForMilestone(minerId: number): Promise<void> {
  const miner = await prisma.miner.findFirst({
    where: { id: minerId, isActive: true, isArchived: false },
    select: { id: true },
  });
  if (!miner) {
    throw new Error("minerId must reference an active catalog machine.");
  }
}

type MilestoneRow = {
  id: number;
  dayThreshold: number;
  rewardType: string;
  rewardValue: Prisma.Decimal;
  validityDays: number;
  minerId: number | null;
  itemCode: string | null;
  metadataJson: Prisma.JsonValue | null;
};

async function applyMilestoneRewardInTx(tx: TxClient, userId: number, milestone: MilestoneRow): Promise<void> {
  const rewardType = normalizeMilestoneRewardType(milestone.rewardType);
  if (!isAllowedMilestoneRewardType(rewardType)) {
    throw new Error(`MILESTONE_REWARD_TYPE_NOT_ALLOWED:${milestone.rewardType}`);
  }

  const value = Number(milestone.rewardValue || 0);

  if (rewardType === REWARD_POL) {
    if (!(value > 0)) throw new Error("POL_REWARD_INVALID_AMOUNT");
    await createRewardInboxEntry(tx, {
      userId,
      source: "checkin_milestone",
      rewardType: REWARD_POL,
      rewardValue: value,
    });
    log.info("checkin milestone POL reward credited to reward inbox", {
      userId,
      milestoneId: milestone.id,
      rewardType,
      rewardValue: value,
    });
    return;
  }

  if (rewardType === REWARD_TEMPORARY_POWER) {
    if (!(value > 0)) throw new Error("TEMPORARY_POWER_REWARD_INVALID_AMOUNT");
    const durationHours = readDurationHours(milestone.validityDays, milestone.metadataJson);
    await createRewardInboxEntry(tx, {
      userId,
      source: "checkin_milestone",
      rewardType: REWARD_TEMPORARY_POWER,
      rewardValue: value,
      durationHours,
    });
    log.info("checkin milestone temporary power reward credited to reward inbox", {
      userId,
      milestoneId: milestone.id,
      rewardType,
      rewardValue: value,
      durationHours,
    });
    return;
  }

  if (rewardType === REWARD_MACHINE) {
    const minerId = milestone.minerId;
    if (!minerId || minerId < 1) throw new Error("MACHINE_REWARD_MISSING_MINER");
    const miner = await tx.miner.findFirst({
      where: { id: minerId, isActive: true, isArchived: false },
      select: { id: true, name: true, baseHashRate: true },
    });
    if (!miner) throw new Error("MACHINE_REWARD_MINER_NOT_FOUND");
    await createRewardInboxEntry(tx, {
      userId,
      source: "checkin_milestone",
      rewardType: REWARD_MACHINE,
      rewardValue: Number(miner.baseHashRate ?? 0),
      minerId: miner.id,
      minerName: miner.name,
    });
    log.info("checkin milestone machine reward credited to reward inbox", {
      userId,
      milestoneId: milestone.id,
      rewardType,
      minerId: miner.id,
      minerName: miner.name,
    });
    return;
  }
}

export async function applyStreakMilestoneRewards(userId: number): Promise<{ granted: Array<{ milestoneId: number; dayThreshold: number; rewardType: string; rewardValue: number }>; streak: number }> {
  const streak = await computeCheckinStreak(userId);
  const milestones = await prisma.checkinStreakMilestone.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
  });
  if (milestones.length === 0) {
    return { granted: [], streak };
  }

  const claimedRows = await prisma.userCheckinStreakReward.findMany({
    where: { userId },
    select: { milestoneId: true },
  });
  const claimed = new Set(claimedRows.map((r) => r.milestoneId));

  const granted: Array<{ milestoneId: number; dayThreshold: number; rewardType: string; rewardValue: number }> = [];

  for (const m of milestones) {
    if (isInvalidLegacyMilestoneRewardType(m.rewardType)) continue;
    if (!isAllowedMilestoneRewardType(m.rewardType)) continue;
    if (streak < m.dayThreshold) continue;
    if (claimed.has(m.id)) continue;

    const rewardType = normalizeMilestoneRewardType(m.rewardType);
    const value = Number(m.rewardValue || 0);

    try {
      await prisma.$transaction(async (tx) => {
        await tx.userCheckinStreakReward.create({
          data: { userId, milestoneId: m.id, streakWhenClaimed: streak },
        });
        await applyMilestoneRewardInTx(tx, userId, m);
      });

      granted.push({ milestoneId: m.id, dayThreshold: m.dayThreshold, rewardType, rewardValue: value });
      claimed.add(m.id);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      const message = error instanceof Error ? error.message : "unknown";
      log.error("checkin.milestones apply", { userId, milestoneId: m.id, err: message });
    }
  }

  return { granted, streak };
}

export async function buildMilestoneStatusForUser(userId: number, streak: number) {
  const milestones = await prisma.checkinStreakMilestone.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
    include: {
      miner: { select: { id: true, name: true, baseHashRate: true, imageUrl: true } },
    },
  });
  const claims = await prisma.userCheckinStreakReward.findMany({
    where: { userId },
    select: { milestoneId: true, streakWhenClaimed: true, createdAt: true },
  });
  const claimByMilestone = new Map(claims.map((c) => [c.milestoneId, c]));

  const out: Array<Record<string, unknown>> = [];

  for (const m of milestones) {
    const legacyInvalid = isInvalidLegacyMilestoneRewardType(m.rewardType);
    const rewardType = normalizeMilestoneRewardType(m.rewardType);
    const allowed = isAllowedMilestoneRewardType(rewardType);

    if (legacyInvalid || !allowed) {
      out.push({
        id: m.id,
        milestoneDay: m.dayThreshold,
        dayThreshold: m.dayThreshold,
        rewardType: "unavailable",
        rewardValue: 0,
        amount: 0,
        validityDays: m.validityDays,
        durationHours: null,
        minerId: null,
        minerName: null,
        itemCode: null,
        status: "unavailable",
        state: "unavailable",
        legacyInvalid: true,
        labelKey: "checkin.milestones.reward.unavailable.title",
        sortOrder: m.sortOrder,
        claimedAt: null,
      });
      continue;
    }

    const claim = claimByMilestone.get(m.id);
    const claimed = Boolean(claim);
    const reached = streak >= m.dayThreshold;
    let state = "locked";
    if (claimed) state = "claimed";
    else if (reached) state = "eligible";

    const durationHours = readDurationHours(m.validityDays, m.metadataJson);

    out.push({
      id: m.id,
      milestoneDay: m.dayThreshold,
      dayThreshold: m.dayThreshold,
      rewardType,
      rewardValue: Number(m.rewardValue || 0),
      amount: Number(m.rewardValue || 0),
      powerAmount:
        rewardType === REWARD_TEMPORARY_POWER
          ? Number(m.rewardValue || 0)
          : rewardType === REWARD_MACHINE && m.miner?.baseHashRate != null
            ? Number(m.miner.baseHashRate)
            : null,
      durationHours: rewardType === REWARD_TEMPORARY_POWER ? durationHours : null,
      validityDays: m.validityDays,
      minerId: m.minerId,
      minerName: m.miner?.name ?? null,
      minerImageUrl: m.miner?.imageUrl ?? null,
      // Always expose catalog H/s when a miner is linked (machine prizes).
      minerBaseHashRate:
        m.miner?.baseHashRate != null && Number.isFinite(Number(m.miner.baseHashRate))
          ? Number(m.miner.baseHashRate)
          : null,
      itemCode: null,
      status: state,
      state,
      legacyInvalid: false,
      labelKey: `checkin.milestones.reward.${rewardType}.title`,
      sortOrder: m.sortOrder,
      claimedAt: claim?.createdAt?.toISOString() ?? null,
    });
  }

  return out;
}

export function buildUpcomingMilestones(milestones: Awaited<ReturnType<typeof buildMilestoneStatusForUser>>) {
  return milestones
    .filter((m) => m.state !== "claimed" && m.state !== "unavailable" && m.rewardType !== "unavailable")
    .slice(0, 8)
    .map((m) => ({
      day: m.dayThreshold as number,
      milestoneDay: m.dayThreshold as number,
      rewardType: String(m.rewardType),
      rewardValue: m.rewardValue as number,
      amount: m.amount as number,
      durationHours: m.durationHours ?? null,
      minerId: (m.minerId as number | null) ?? null,
      minerName: (m.minerName as string | null) ?? null,
      minerBaseHashRate: (m.minerBaseHashRate as number | null) ?? null,
      labelKey: String(m.labelKey),
    }));
}
