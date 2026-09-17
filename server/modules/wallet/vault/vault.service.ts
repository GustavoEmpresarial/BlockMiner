/**
 * Miner warehouse (vault) — time-locked storage that pulls a machine out of
 * active mining. Ported from legacy modules/vault/application/vault.service.ts.
 *
 * Rack <-> vault path (source: "rack" / destination: "rack"): the machine's
 * `UserMiner`/`UserRack` bookkeeping is owned by modules/machines, so this
 * service only reads/writes `UserVault` directly and delegates every rack
 * mutation to the composable tx helpers machines/index.ts exposes
 * (findRackMinerForUserTx, releaseRackReferencesTx, ensureOwnedMachineForRackMinerTx,
 * syncOwnedMachineLocationForVaultTx, deleteRackMinerTx, placeIntoRackSlotTx). Both
 * sides run inside ONE `prisma.$transaction` here so the move is atomic.
 *
 * Deviations (documented, matching the pattern already used across
 * machines/inventory/support):
 * - Advisory lock: legacy wraps every mutation with
 *   `advisoryXactTryLockOrThrow(tx, \`vault:${userId}\`)` (real Postgres advisory
 *   lock) before the `$transaction`. That lock infra has not been ported into
 *   current/server/core yet — this module relies on `prisma.$transaction` plus the
 *   unique constraints (`user_miners.userId_slotIndex`, unique `owned_machine_id`
 *   FKs) as the interim safety net, same as modules/machines and modules/inventory.
 *   Re-wrap with the real advisory lock once it lands in core/database.
 * - Mining engine hashrate resync: FIXED in item 88 (was a documented TODO no-op here and
 *   in machines/inventory — all three wired now). Only the two RACK-touching paths resync
 *   (`source === "rack"` on store, `destination === "rack"` on retrieve); the
 *   inventory <-> vault paths never change the rack, so they never change hashrate.
 *   The Socket.IO `vault:update` emit remains a documented no-op.
 * - `createNotification` IS real and ported (notifications/index.ts), so unlike the
 *   engine hook, the "miner stored/retrieved" notification is genuinely sent.
 */
import { HttpStatusError } from "../../../shared/errors/httpStatusError.js";
import prisma from "../../../core/database/prisma.js";
import * as vaultRepo from "./vault.repository.js";
import { VAULT_BULK_MAX } from "./vault.schemas.js";
import { createNotification } from "../../notifications/index.js";
import { miningEngine } from "../../mining/index.js";
import {
  findRackMinerForUserTx,
  releaseRackReferencesTx,
  ensureOwnedMachineForRackMinerTx,
  syncOwnedMachineLocationForVaultTx,
  deleteRackMinerTx,
  placeIntoRackSlotTx,
} from "../../machines/index.js";
import { resolveOwnedMachineDisplay } from "../../machines/ownedMachineDisplay.js";
import { getMachinesListCache, invalidateMachinesListCache, setMachinesListCache } from "../../machines/machinesList.cache.js";

export async function listVaultForUser(userId: number) {
  const cached = getMachinesListCache<ReturnType<typeof mapVaultRows>>("vault", userId);
  if (cached) return cached;

  const rows = await vaultRepo.listVault(userId);
  const mapped = mapVaultRows(rows);
  setMachinesListCache("vault", userId, mapped);
  return mapped;
}

function mapVaultRows(rows: Awaited<ReturnType<typeof vaultRepo.listVault>>) {
  return rows.map((r) => {
    const display = resolveOwnedMachineDisplay({
      minerId: r.minerId,
      rowName: r.minerName,
      rowImageUrl: r.imageUrl,
      catalogName: r.miner?.name,
      catalogImageUrl: r.miner?.imageUrl,
      ownedName: r.ownedMachine?.minerName,
      ownedImageUrl: r.ownedMachine?.imageUrl,
      eventName: r.ownedMachine?.eventMiner?.name,
      eventImageUrl: r.ownedMachine?.eventMiner?.imageUrl,
    });
    const { miner: _miner, ownedMachine: _owned, ...rest } = r;
    return { ...rest, minerName: display.minerName, imageUrl: display.imageUrl, hashRate: Number(r.hashRate) };
  });
}

export type MoveToVaultInput = { source: "inventory" | "rack"; itemId?: number; itemIds?: number[] };
export type RetrieveFromVaultInput = {
  destination: "inventory" | "rack";
  vaultId?: number;
  vaultIds?: number[];
  /** Required when destination === "rack" — the target rack slot. */
  slotIndex?: number;
};

/** Best-effort engine resync (item 88) — DB já commitou; falha aqui não pode virar erro. */
async function resyncEngine(userId: number): Promise<void> {
  try {
    await miningEngine.reloadMinerProfile(userId);
  } catch {
    /* engine cache resync is best-effort — DB is already the source of truth */
  }
}

/** Best-effort post-commit notification — mirrors legacy's createNotification call site; never throws. */
async function notifyVaultMove(userId: number, title: string, message: string, type: "info" | "success"): Promise<void> {
  try {
    await createNotification({ userId, title, message, type });
  } catch {
    /* notification failures must never roll back an already-committed vault move */
  }
}

export async function moveToVaultForUser(userId: number, body: MoveToVaultInput): Promise<{ movedCount: number }> {
  if (body.source === "rack") {
    const machineId = body.itemId;
    if (machineId == null || !Number.isInteger(machineId) || machineId <= 0) {
      throw new HttpStatusError(400, "INVALID_RACK_REF");
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const userMiner = await findRackMinerForUserTx(tx, userId, machineId);
      if (!userMiner) throw new HttpStatusError(404, "NOT_FOUND");

      const display = resolveOwnedMachineDisplay({
        minerId: userMiner.minerId,
        rowImageUrl: userMiner.imageUrl,
        catalogName: userMiner.miner?.name,
        catalogImageUrl: userMiner.miner?.imageUrl,
        ownedName: userMiner.ownedMachine?.minerName,
        ownedImageUrl: userMiner.ownedMachine?.imageUrl,
        eventName: userMiner.ownedMachine?.eventMiner?.name,
        eventImageUrl: userMiner.ownedMachine?.eventMiner?.imageUrl,
      });
      const omId = await ensureOwnedMachineForRackMinerTx(
        tx,
        {
          id: userMiner.id,
          userId,
          ownedMachineId: userMiner.ownedMachineId,
          minerId: userMiner.minerId,
          level: userMiner.level,
          hashRate: userMiner.hashRate,
          slotSize: userMiner.slotSize,
          imageUrl: display.imageUrl,
        },
        display.minerName,
      );
      await releaseRackReferencesTx(tx, userMiner.id);
      await vaultRepo.createVaultRowTx(tx, {
        userId,
        minerId: userMiner.minerId,
        minerName: display.minerName,
        level: userMiner.level,
        hashRate: userMiner.hashRate,
        slotSize: userMiner.slotSize,
        imageUrl: display.imageUrl,
        storedAt: now,
        ownedMachineId: omId,
      });
      await syncOwnedMachineLocationForVaultTx(tx, omId, "WAREHOUSE", {
        minerId: userMiner.minerId,
        minerName: display.minerName,
        level: userMiner.level,
        hashRate: userMiner.hashRate,
        slotSize: userMiner.slotSize ?? 1,
        imageUrl: display.imageUrl,
      });
      await deleteRackMinerTx(tx, userMiner.id);
    });

    // item 88: máquina saiu do rack → o hashrate do usuário CAIU. Sem isto o engine
    // continuava contando a máquina guardada (usuário minerava de graça com ela no armazém).
    await resyncEngine(userId);
    await notifyVaultMove(userId, "Miner stored", "Your miner was moved to the warehouse (vault).", "info");
    invalidateMachinesListCache(userId);
    return { movedCount: 1 };
  }

  const ids = body.itemIds && body.itemIds.length > 0 ? body.itemIds : body.itemId != null ? [body.itemId] : [];
  if (ids.length === 0 || ids.length > VAULT_BULK_MAX) {
    throw new HttpStatusError(400, "INVALID_SELECTION");
  }
  try {
    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        await vaultRepo.moveInventoryItemToVaultInTx(tx, userId, id);
      }
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "NOT_FOUND") throw new HttpStatusError(404, "NOT_FOUND");
    throw err;
  }
  invalidateMachinesListCache(userId);
  return { movedCount: ids.length };
}

export async function retrieveFromVaultForUser(userId: number, body: RetrieveFromVaultInput): Promise<{ movedCount: number }> {
  if (body.destination === "rack") {
    const vaultId = body.vaultId;
    if (vaultId == null || !Number.isInteger(vaultId) || vaultId <= 0) {
      throw new HttpStatusError(400, "INVALID_VAULT_ITEM");
    }
    const slotIndex = body.slotIndex;
    if (slotIndex == null || !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 80) {
      throw new HttpStatusError(400, "INVALID_SLOT");
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const vaultItem = await vaultRepo.findVaultItemTx(tx, userId, vaultId);
      if (!vaultItem) throw new HttpStatusError(404, "NOT_FOUND");

      const slotSize = Number(vaultItem.slotSize || 1);
      {
        const omId = await vaultRepo.ensureOwnedMachineForVaultRowTx(tx, vaultItem);
        const created = await placeIntoRackSlotTx(
          tx,
          userId,
          slotIndex,
          slotSize,
          {
            level: vaultItem.level,
            hashRate: vaultItem.hashRate,
            minerId: vaultItem.minerId,
            imageUrl: vaultItem.imageUrl,
            ownedMachineId: omId,
          },
          now,
        );
        await syncOwnedMachineLocationForVaultTx(tx, omId, "RACK", {
          minerId: vaultItem.minerId,
          minerName: vaultItem.minerName,
          level: vaultItem.level,
          hashRate: vaultItem.hashRate,
          slotSize: vaultItem.slotSize ?? 1,
          imageUrl: vaultItem.imageUrl,
        });
        await vaultRepo.deleteVaultRowTx(tx, vaultId);
        void created;
      }
    });

    // item 88: máquina voltou pro rack → hashrate SUBIU (e o `placeIntoRackSlotTx` pode ter
    // deslocado outra pro inventário). Sem isto ela não minerava até reiniciar o servidor.
    await resyncEngine(userId);
    await notifyVaultMove(userId, "Miner retrieved", "Your miner was removed from the warehouse (vault).", "success");
    invalidateMachinesListCache(userId);
    return { movedCount: 1 };
  }

  const ids = body.vaultIds && body.vaultIds.length > 0 ? body.vaultIds : body.vaultId != null ? [body.vaultId] : [];
  if (ids.length === 0 || ids.length > VAULT_BULK_MAX) {
    throw new HttpStatusError(400, "INVALID_SELECTION");
  }
  try {
    await prisma.$transaction(async (tx) => {
      for (const id of ids) {
        await vaultRepo.retrieveVaultItemToInventoryInTx(tx, userId, id);
      }
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "NOT_FOUND") throw new HttpStatusError(404, "NOT_FOUND");
    throw err;
  }
  invalidateMachinesListCache(userId);
  return { movedCount: ids.length };
}
