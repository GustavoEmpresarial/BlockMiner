/**
 * Ported from legacy offerEventPurchaseService + offerEvent.controller serializers.
 *
 * Deviations:
 * - advisoryXactTryLockOrThrow (full legacy helper) not ported — but item 85 added a scoped
 *   `pg_advisory_xact_lock(userId, eventMinerId)` directly in `purchaseEventMinerForUser`'s
 *   transaction, closing the real race that let a player exceed `claimLimitPerUser` (two
 *   concurrent claims both reading the pre-insert count before either committed). Global stock
 *   was already safe via `incrementSoldCountOptimistic`'s compare-and-swap; only the per-user
 *   limit was unprotected.
 * - applyUserBalanceDelta / miningRuntime skipped — DB balance is source of truth.
 * - createNotification persists only (no Socket.IO).
 * - Inventory via grantPurchasedInventoryItems from inventory/index.
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { grantPurchasedInventoryItems, normalizePersistableMinerImageUrl } from "../inventory/index.js";
import { createNotification } from "../notifications/index.js";
import {
  getUserBalanceNumber,
  hasEventMinerStock,
  isOfferEventActiveForPublic,
  isOfferEventLiveAt,
  mapBalances,
  normalizeOfferCurrency,
  offerEventDeliveryAt,
  userBalanceFieldForCurrency,
} from "./offer-events.helpers.js";
import { buildActiveRoomOffersPayload } from "../rooms/rooms.offers.js";
import { buildActiveFanOffersPayload } from "../fans/index.js";
import { buildActiveRackOffersPayload } from "../racks/index.js";
import { countUnlockedRoomsForUser } from "../rooms/rooms.service.js";
import { OFFER_EVENT_DELIVERY_BATCH, OFFER_EVENT_PURCHASE_MAX_QUANTITY } from "./offer-events.config.js";
import * as repo from "./offer-events.repository.js";

const log = logger.child("offer-events.service");

/** Ported from legacy offerEventsExpireCron.ts's deactivateExpiredOfferEvents. Called by
 *  cron/offer-events-expire.cron.ts on a schedule; kept in this module per cron doctrine. */
export async function deactivateExpiredOfferEvents(): Promise<number> {
  const result = await repo.deactivateExpiredOfferEventsWhere(new Date());
  if (result.count > 0) {
    log.info(`Deactivated ${result.count} expired offer event(s).`);
  }
  return result.count;
}

type EventMinerPublic = {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  modelUrl?: string | null;
  deliveryDelayDays?: number;
  price: unknown;
  hashRate: number;
  currency: string;
  slotSize: number;
  stockUnlimited: boolean;
  stockCount: number | null;
  soldCount: number;
  isActive: boolean;
  isFree: boolean;
  claimLimitPerUser: number;
};

type OfferEventPublic = {
  id: number;
  title: string;
  description: string;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  deletedAt?: Date | null;
  miners?: EventMinerPublic[];
};

export function serializeMinerPublic(
  m: EventMinerPublic,
  claimMap: Record<number, number> = {},
  pendingDeliveryAt: Record<number, string> = {},
) {
  const remaining =
    m.stockUnlimited || m.stockCount == null
      ? null
      : Math.max(0, (m.stockCount ?? 0) - (m.soldCount ?? 0));
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    imageUrl: m.imageUrl,
    modelUrl: m.modelUrl ?? null,
    deliveryDelayDays: m.deliveryDelayDays ?? 0,
    pendingDeliveryAt: pendingDeliveryAt[m.id] ?? null,
    price: Number(m.price),
    hashRate: m.hashRate,
    currency: m.currency,
    slotSize: m.slotSize,
    inStock: hasEventMinerStock(m),
    remaining,
    isFree: m.isFree,
    claimLimitPerUser: m.claimLimitPerUser,
    userClaimCount: claimMap[m.id] ?? 0,
  };
}

export function serializeEventPublic(
  e: OfferEventPublic,
  now: Date,
  claimMap: Record<number, number> = {},
  pendingDeliveryAt: Record<number, string> = {},
) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    imageUrl: e.imageUrl,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    isActive: e.isActive,
    miners: (e.miners ?? []).map((m) => serializeMinerPublic(m, claimMap, pendingDeliveryAt)),
    isLive: isOfferEventActiveForPublic(now, e),
  };
}

type PurchaseWriter = {
  eventPurchase: {
    create: (args: {
      data: {
        userId: number;
        eventId: number;
        eventMinerId: number;
        pricePaid: number | string | { toString(): string };
        currency: string;
      };
    }) => Promise<{ id: number }>;
  };
  eventMinerDelivery: {
    create: (args: {
      data: {
        userId: number;
        eventId: number;
        eventMinerId: number;
        eventPurchaseId: number;
        deliverAt: Date;
      };
    }) => Promise<unknown>;
  };
};

async function recordEventPurchases(
  tx: PurchaseWriter,
  input: {
    userId: number;
    eventId: number;
    eventMinerId: number;
    qty: number;
    pricePaid: number | string | { toString(): string };
    currency: string;
    deliverAt: Date | null;
  },
) {
  for (let i = 0; i < input.qty; i += 1) {
    const purchase = await tx.eventPurchase.create({
      data: {
        userId: input.userId,
        eventId: input.eventId,
        eventMinerId: input.eventMinerId,
        pricePaid: input.pricePaid,
        currency: input.currency,
      },
    });
    if (!input.deliverAt) continue;
    await tx.eventMinerDelivery.create({
      data: {
        userId: input.userId,
        eventId: input.eventId,
        eventMinerId: input.eventMinerId,
        eventPurchaseId: purchase.id,
        deliverAt: input.deliverAt,
      },
    });
  }
}

export async function listActiveOfferEventsForUser(userId?: number) {
  const now = new Date();
  const events = await repo.listActiveOfferEvents({
    deletedAt: null,
    isActive: true,
    endsAt: { gte: now },
  });

  let claimMap: Record<number, number> = {};
  let pendingDeliveryAt: Record<number, string> = {};
  let unlockedRoomCount: number | undefined;
  if (userId) {
    const allMinerIds = events.flatMap((e) => e.miners.map((m) => m.id));
    if (allMinerIds.length > 0) {
      const claimCounts = await repo.groupEventPurchaseClaimCounts(userId, allMinerIds);
      claimMap = Object.fromEntries(claimCounts.map((row) => [row.eventMinerId, row._count.id]));
      const pending = await repo.listPendingDeliveryAts(userId, allMinerIds);
      pendingDeliveryAt = Object.fromEntries(
        pending
          .filter((row) => row._min.deliverAt)
          .map((row) => [row.eventMinerId, row._min.deliverAt!.toISOString()]),
      );
    }
    unlockedRoomCount = await countUnlockedRoomsForUser(userId);
  }

  return {
    events: events.map((e) => serializeEventPublic(e, now, claimMap, pendingDeliveryAt)),
    roomOffers: buildActiveRoomOffersPayload(now, { unlockedRoomCount }),
    fanOffers: buildActiveFanOffersPayload(now),
    rackOffers: buildActiveRackOffersPayload(now),
    serverTime: now.toISOString(),
  };
}

export type PurchaseResult =
  | { ok: true; message: string; balances: Record<string, number> }
  | { ok: false; code: string; message: string; status: number };

export async function purchaseEventMinerForUser(
  userId: number,
  eventMinerId: number,
  quantity = 1,
): Promise<PurchaseResult> {
  const now = new Date();
  const qty = Math.max(1, Math.min(OFFER_EVENT_PURCHASE_MAX_QUANTITY, Math.floor(Number(quantity) || 1)));

  try {
    const result = await prisma.$transaction(async (tx) => {
      // item 85: sem isto, dois cliques/requests simultâneos liam `existingClaims` (abaixo)
      // ANTES de qualquer um confirmar seu insert — os dois passavam a checagem do
      // claim_limit_per_user e o jogador acabava com mais coletas grátis do que o limite
      // permite (bug real reportado: jogador com 4 máquinas grátis num evento com limite 3).
      // `incrementSoldCountOptimistic` já protegia o estoque GLOBAL com compare-and-swap, mas
      // o limite POR JOGADOR nunca tinha proteção nenhuma — cabeçalho do módulo já documentava
      // isso como "advisoryXactTryLockOrThrow not ported"; portado agora só pro caminho que
      // realmente precisa (claim), como um lock leve escopado a (userId, eventMinerId) que
      // serializa transações concorrentes do MESMO jogador na MESMA máquina de evento —
      // libera sozinho no fim da transação (commit ou rollback), sem precisar de retry manual.
      // item 85 (corrigido item 93): a forma de DOIS argumentos do advisory lock é
      // pg_advisory_xact_lock(int4, int4) — NÃO existe (bigint, bigint). Usar ::bigint
      // fazia toda coleta cair em "function does not exist" → 500. userId/eventMinerId são
      // Int (int4) no schema e sempre pequenos, então ::int é seguro.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${eventMinerId}::int)`;

      const em = await tx.eventMiner.findUnique({
        where: { id: eventMinerId },
        include: { event: true },
      });

      if (!em || !em.event || em.event.deletedAt) {
        throw Object.assign(new Error("MINER_NOT_FOUND"), { code: "NOT_FOUND" });
      }

      if (!isOfferEventLiveAt(now, em.event)) {
        throw Object.assign(new Error("EVENT_NOT_ACTIVE"), { code: "EXPIRED" });
      }

      if (!em.isActive || !hasEventMinerStock(em)) {
        throw Object.assign(new Error("MINER_UNAVAILABLE"), { code: "UNAVAILABLE" });
      }

      const currency = normalizeOfferCurrency(em.currency);
      const slotSize =
        Number.isInteger(em.slotSize) && em.slotSize >= 1 && em.slotSize <= 2 ? em.slotSize : 1;
      const deliverAt = offerEventDeliveryAt(now, em.deliveryDelayDays);
      let totalPrice = 0;

      if (em.isFree) {
        if (em.claimLimitPerUser > 0) {
          const existingClaims = await tx.eventPurchase.count({
            where: { userId, eventMinerId: em.id },
          });
          if (existingClaims + qty > em.claimLimitPerUser) {
            throw Object.assign(new Error("CLAIM_LIMIT_EXCEEDED"), { code: "CLAIM_LIMIT_EXCEEDED" });
          }
        }

        await repo.incrementSoldCountOptimistic(tx, em.id, qty);

        await recordEventPurchases(tx as unknown as PurchaseWriter, {
          userId,
          eventId: em.eventId,
          eventMinerId: em.id,
          qty,
          pricePaid: 0,
          currency,
          deliverAt,
        });
      } else {
        const price = Number(em.price);
        if (!Number.isFinite(price) || price <= 0) {
          throw Object.assign(new Error("INVALID_PRICE"), { code: "SERVER" });
        }

        totalPrice = price * qty;
        const balanceField = userBalanceFieldForCurrency(currency);

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw Object.assign(new Error("USER_NOT_FOUND"), { code: "NOT_FOUND" });
        }

        if (getUserBalanceNumber(user as unknown as Record<string, unknown>, currency) < totalPrice) {
          throw Object.assign(new Error("INSUFFICIENT_BALANCE"), { code: "INSUFFICIENT" });
        }

        await repo.incrementSoldCountOptimistic(tx, em.id, qty);

        await tx.user.update({
          where: { id: userId },
          data: { [balanceField]: { decrement: totalPrice } },
        });

        await recordEventPurchases(tx as unknown as PurchaseWriter, {
          userId,
          eventId: em.eventId,
          eventMinerId: em.id,
          qty,
          pricePaid: em.price,
          currency,
          deliverAt,
        });
      }

      if (!deliverAt) {
        await grantPurchasedInventoryItems(
          tx,
          userId,
          {
            minerId: null,
            eventMinerId: em.id,
            minerName: `[Event] ${em.name}`,
            level: 1,
            hashRate: em.hashRate,
            slotSize,
            imageUrl: normalizePersistableMinerImageUrl(em.imageUrl),
            acquisitionSource: "offer_event",
          },
          qty,
          now,
        );
      }

      const updatedUser = await tx.user.findUnique({ where: { id: userId } });
      return {
        minerName: em.name,
        eventTitle: em.event.title,
        currency,
        isFree: em.isFree,
        totalPrice,
        deliverAt,
        deliveryDelayDays: em.deliveryDelayDays ?? 0,
        updatedUser,
      };
    });

    const { minerName, eventTitle, isFree, deliverAt, deliveryDelayDays, updatedUser } = result;

    // applyUserBalanceDelta skipped — DB balance is source of truth (no miningRuntime).

    const arrivalNote = deliverAt
      ? `A maquina chega no inventario em ${deliveryDelayDays} dias.`
      : `${qty > 1 ? "Os equipamentos estao" : "O equipamento esta"} no inventario!`;

    await createNotification({
      userId,
      title: isFree ? "Maquina gratis coletada!" : "Oferta especial",
      message: isFree
        ? `Voce coletou ${qty}x ${minerName} gratuitamente! ${arrivalNote}`
        : `Voce comprou ${qty}x ${minerName} no evento "${eventTitle}". ${arrivalNote}`,
      type: "success",
    });

    return {
      ok: true,
      message: deliverAt
        ? `${qty}x ${minerName} reservada. Chega no inventario em ${deliveryDelayDays} dias.`
        : `${qty}x ${minerName} adicionado(s) ao inventario.`,
      balances: mapBalances(updatedUser as unknown as Record<string, unknown>),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "MINER_NOT_FOUND" || msg === "USER_NOT_FOUND") {
      return { ok: false, status: 404, code: "not_found", message: "Miner or event not found." };
    }
    if (msg === "INSUFFICIENT_BALANCE") {
      return { ok: false, status: 400, code: "insufficient_balance", message: "Insufficient balance." };
    }
    if (msg === "CLAIM_LIMIT_EXCEEDED") {
      return {
        ok: false,
        status: 400,
        code: "claim_limit_exceeded",
        message: "Limite de coletas atingido para esta maquina.",
      };
    }
    if (msg === "OUT_OF_STOCK" || msg === "MINER_UNAVAILABLE") {
      return {
        ok: false,
        status: 400,
        code: "out_of_stock",
        message: "This offer is sold out or unavailable.",
      };
    }
    if (msg === "EVENT_NOT_ACTIVE") {
      return { ok: false, status: 400, code: "event_expired", message: "This event is not active." };
    }
    if (msg === "STOCK_BUSY") {
      return { ok: false, status: 409, code: "retry", message: "Please try again." };
    }
    log.error("purchaseEventMinerForUser", { error: String(e) });
    return { ok: false, status: 500, code: "error", message: "Purchase failed." };
  }
}

/** Grants miners whose delivery day has arrived. Image miners never enter this queue. */
export async function deliverDueEventMiners(now: Date = new Date()): Promise<number> {
  const due = await repo.listDueEventMinerDeliveryIds(now, OFFER_EVENT_DELIVERY_BATCH);
  let delivered = 0;
  for (const row of due) {
    const granted = await grantDueDelivery(row.id, now);
    if (granted) delivered += 1;
  }
  if (delivered > 0) log.info(`Delivered ${delivered} delayed offer miner(s).`);
  return delivered;
}

async function grantDueDelivery(deliveryId: number, now: Date): Promise<boolean> {
  try {
    const granted = await prisma.$transaction(async (tx) => {
      const claimed = await tx.eventMinerDelivery.updateMany({
        where: { id: deliveryId, deliveredAt: null, deliverAt: { lte: now } },
        data: { deliveredAt: now },
      });
      if (claimed.count !== 1) return null;
      const row = await tx.eventMinerDelivery.findUnique({
        where: { id: deliveryId },
        include: { eventMiner: true },
      });
      if (!row?.eventMiner) return null;
      const em = row.eventMiner;
      const slotSize =
        Number.isInteger(em.slotSize) && em.slotSize >= 1 && em.slotSize <= 2 ? em.slotSize : 1;
      await grantPurchasedInventoryItems(
        tx,
        row.userId,
        {
          minerId: null,
          eventMinerId: em.id,
          minerName: `[Event] ${em.name}`,
          level: 1,
          hashRate: em.hashRate,
          slotSize,
          imageUrl: normalizePersistableMinerImageUrl(em.imageUrl),
          acquisitionSource: "offer_event",
        },
        1,
        now,
      );
      return { userId: row.userId, minerName: em.name };
    });
    if (!granted) return false;
    await createNotification({
      userId: granted.userId,
      title: "Maquina entregue",
      message: `${granted.minerName} chegou e esta no inventario.`,
      type: "success",
    });
    return true;
  } catch (err: unknown) {
    log.error("grantDueDelivery", { deliveryId, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
