/**
 * Ported from legacy/server/modules/reward-inbox/application/rewardInbox.service.ts
 * + services/rewardInboxService.ts create helper.
 *
 * Deviations:
 * - applyPolDeltaInEngine / miningEngine.reloadMinerProfile dropped (no miningRuntime).
 * - Machine grants use inventory.grantPurchasedInventoryItems via public boundary.
 * - syncUserBaseHashRate via mining/index after temporary_power / machine / hashrate_boost.
 */
import { Prisma } from "@prisma/client";
import prisma, { type TxClient } from "../../core/database/prisma.js";
import { emitUserInventoryUpdate } from "../../core/socket/userEvents.js";
import { grantPurchasedInventoryItems } from "../inventory/index.js";
import { syncUserBaseHashRate } from "../mining/index.js";
import { enqueueEarningsPolCreditedTx, type EarningsSource } from "../events/index.js";
import {
  isPendingTournamentPowerInboxItem,
  isTemporaryPowerRewardType,
  resolvePowerBoostGame,
} from "./reward-inbox.power.js";
import * as repo from "./reward-inbox.repository.js";

function mapInboxSourceToEarningsSource(source: string): EarningsSource | null {
  const s = source.toLowerCase();
  if (s === "checkin_milestone") return "checkin";
  if (s === "faucet" || s === "faucet_power") return "faucet";
  if (s === "shortlink" || s === "shortlinks") return "shortlinks";
  if (s === "youtube" || s === "youtuber_reward") return "youtube";
  if (s === "auto_mining" || s === "auto_mining_v2") return "autoMining";
  if (s === "tournament" || s === "game" || s === "games" || s === "daily_task" || s === "burn_event") {
    return "games";
  }
  if (s === "offerwall" || s === "internal_offerwall") return "offerwallInternal";
  return null;
}

function readInboxEventMinerId(metaJson: unknown): number | null {
  if (!metaJson || typeof metaJson !== "object" || Array.isArray(metaJson)) return null;
  const raw = (metaJson as Record<string, unknown>).eventMinerId;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function grantTemporaryPowerInTx(
  tx: TxClient,
  userId: number,
  item: { rewardValue: unknown; durationHours: number | null; rewardType: string; source: string },
): Promise<void> {
  const value = Number(item.rewardValue || 0);
  if (!(value > 0)) throw new Error("INVALID_REWARD_VALUE");
  const { slug, name } = resolvePowerBoostGame(item.rewardType, item.source);
  const game = await repo.upsertBonusGameTx(tx, slug, name);
  const durationMs = (item.durationHours ?? 24) * 60 * 60 * 1000;
  const playedAt = new Date();
  await repo.createUserPowerGameTx(tx, {
    userId,
    gameId: game.id,
    hashRate: value,
    playedAt,
    expiresAt: new Date(playedAt.getTime() + durationMs),
  });
}

export async function listPendingInboxForUser(userId: number) {
  return repo.listPendingInboxForUser(userId);
}

/** Applies leftover tournament power inbox rows so they never sit in reward inventory. */
export async function applyPendingTournamentPowerInbox(userId: number): Promise<number> {
  const items = await repo.listPendingInboxForUser(userId);
  const powerItems = items.filter((item) => isPendingTournamentPowerInboxItem(item.source, item.rewardType));
  let applied = 0;
  for (const item of powerItems) {
    try {
      await collectInboxItem(userId, item.id);
      applied += 1;
    } catch {
      /* already collected or invalid — skip */
    }
  }
  return applied;
}

export async function collectInboxItem(userId: number, inboxId: number) {
  const item = await repo.findPendingInboxItem(userId, inboxId);
  if (!item) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });

  let needsHashSync = false;

  await prisma.$transaction(async (tx) => {
    const lockedCount = await repo.markInboxItemCollectedTx(tx, inboxId, userId);
    if (lockedCount !== 1) {
      throw Object.assign(new Error("ALREADY_COLLECTED"), { code: "ALREADY_COLLECTED" });
    }

    const value = Number(item.rewardValue || 0);
    const rt = item.rewardType;

    if (rt === "pol") {
      if (!(value > 0)) throw new Error("INVALID_REWARD_VALUE");
      await repo.incrementUserPolBalanceTx(tx, userId, new Prisma.Decimal(String(value)));
      const earningsSource = mapInboxSourceToEarningsSource(item.source);
      if (earningsSource) {
        await enqueueEarningsPolCreditedTx(tx, {
          userId,
          source: earningsSource,
          amountPol: value,
          occurredAt: new Date(),
          eventId: `inbox:${inboxId}`,
          ref: `inbox:${inboxId}`,
        });
      }
    } else if (rt === "blk") {
      if (!(value > 0)) throw new Error("INVALID_REWARD_VALUE");
      await repo.incrementUserBlkBalanceTx(tx, userId, new Prisma.Decimal(String(value)));
    } else if (isTemporaryPowerRewardType(rt)) {
      await grantTemporaryPowerInTx(tx, userId, item);
      needsHashSync = true;
    } else if (rt === "machine") {
      if (!item.minerName) throw new Error("MISSING_MINER_NAME");
      await grantPurchasedInventoryItems(
        tx,
        userId,
        {
          minerId: item.minerId ?? null,
          eventMinerId: readInboxEventMinerId(item.metaJson),
          minerName: item.minerName,
          level: 1,
          hashRate: value,
          slotSize: item.slotSize ?? 1,
          imageUrl: item.minerImageUrl ?? null,
          acquisitionSource: item.source,
        },
        1,
        new Date(),
      );
      needsHashSync = true;
    } else {
      throw new Error(`UNSUPPORTED_REWARD_TYPE:${rt}`);
    }
  });

  if (needsHashSync) {
    await syncUserBaseHashRate(userId).catch(() => undefined);
  }

  if (item.rewardType === "machine") {
    emitUserInventoryUpdate(userId);
  }

  return { ok: true as const, rewardType: item.rewardType };
}

export async function collectAllPendingForUser(userId: number) {
  const items = await repo.listPendingInboxForUser(userId);
  const results = await Promise.allSettled(items.map((item) => collectInboxItem(userId, item.id)));
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  const machinesCollected = results.filter(
    (r) => r.status === "fulfilled" && r.value.rewardType === "machine",
  ).length;
  return { ok: true as const, collected: succeeded, failed, machinesCollected };
}

export { createRewardInboxEntry } from "./reward-inbox.repository.js";
export type { InboxRewardPayload } from "./reward-inbox.repository.js";
