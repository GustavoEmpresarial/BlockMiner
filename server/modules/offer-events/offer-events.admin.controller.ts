/**
 * Ported from legacy/server/modules/admin-offer-events/adminOfferEvent.admin.controller.ts
 */
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { toDecimalPrice } from "./offer-events.helpers.js";
import {
  ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_DEFAULT,
  ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX,
  ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MIN,
  ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_DEFAULT,
  ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX,
  ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MIN,
  DEFAULT_OFFER_CURRENCY,
} from "./offer-events.config.js";
import * as repo from "./offer-events.repository.js";
import {
  eventCreateSchema,
  eventUpdateSchema,
  listEventsQuerySchema,
  listPurchasesQuerySchema,
  minerCreateSchema,
  minerUpdateSchema,
} from "./offer-events.schemas.js";

const log = logger.child("offer-events.admin");

export async function adminListOfferEvents(req: Request, res: Response): Promise<void> {
  try {
    const q = listEventsQuerySchema.safeParse(req.query || {});
    if (!q.success) {
      res.status(400).json({ ok: false, message: "Invalid query.", errors: q.error.issues });
      return;
    }
    const page = Math.max(1, q.data.page ?? 1);
    const pageSize = Math.min(
      ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX,
      Math.max(ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MIN, q.data.pageSize ?? ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_DEFAULT),
    );
    const skip = (page - 1) * pageSize;
    const includeDeleted = q.data.includeDeleted === "1";
    const where = includeDeleted ? {} : { deletedAt: null };

    const [items, total] = await Promise.all([
      prisma.offerEvent.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { id: "desc" },
        include: { _count: { select: { miners: true, purchases: true } } },
      }),
      prisma.offerEvent.count({ where }),
    ]);

    const eventIds = items.map((e) => e.id);
    type StatRow = {
      eventId: number;
      unitSales: number;
      uniqueBuyers: number;
      checkoutBatches: number;
      revenuePol: unknown;
    };
    const statsRows =
      eventIds.length === 0
        ? []
        : await prisma.$queryRaw<StatRow[]>`
            SELECT
              ep.event_id AS "eventId",
              COUNT(*)::int AS "unitSales",
              COUNT(DISTINCT ep.user_id)::int AS "uniqueBuyers",
              COUNT(DISTINCT (ep.user_id, ep.event_miner_id, ep.price_paid, ep.created_at))::int AS "checkoutBatches",
              COALESCE(SUM(CASE WHEN ep.currency = 'POL' THEN ep.price_paid ELSE 0 END), 0) AS "revenuePol"
            FROM event_purchases ep
            WHERE ep.event_id IN (${Prisma.join(eventIds)})
            GROUP BY ep.event_id
          `;
    const statsById = new Map(statsRows.map((s) => [s.eventId, s]));

    res.json({
      ok: true,
      page,
      pageSize,
      total,
      events: items.map((e) => {
        const s = statsById.get(e.id);
        return {
          id: e.id,
          title: e.title,
          description: e.description,
          imageUrl: e.imageUrl,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          isActive: e.isActive,
          deletedAt: e.deletedAt,
          minerCount: e._count.miners,
          purchaseCount: e._count.purchases,
          unitSales: s?.unitSales ?? 0,
          uniqueBuyers: s?.uniqueBuyers ?? 0,
          checkoutBatches: s?.checkoutBatches ?? 0,
          revenuePol: Number(s?.revenuePol ?? 0),
        };
      }),
    });
  } catch (e) {
    log.error("adminListOfferEvents", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error listing events." });
  }
}

export async function adminCreateOfferEvent(req: Request, res: Response): Promise<void> {
  try {
    const d = eventCreateSchema.parse(req.body);
    const startsAt = d.startsAt instanceof Date ? d.startsAt : new Date(d.startsAt);
    const endsAt = d.endsAt instanceof Date ? d.endsAt : new Date(d.endsAt);
    if (endsAt <= startsAt) {
      res.status(400).json({ ok: false, message: "endsAt must be after startsAt." });
      return;
    }

    const event = await prisma.offerEvent.create({
      data: {
        title: d.title,
        description: d.description,
        imageUrl: d.imageUrl || null,
        startsAt,
        endsAt,
        isActive: d.isActive !== false,
      },
    });

    res.json({ ok: true, event });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, message: "Invalid data.", errors: e.issues });
      return;
    }
    log.error("adminCreateOfferEvent", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error creating event." });
  }
}

export async function adminGetOfferEvent(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const event = await prisma.offerEvent.findFirst({
      where: { id },
      include: { _count: { select: { miners: true, purchases: true } } },
    });
    if (!event) {
      res.status(404).json({ ok: false, message: "Not found." });
      return;
    }
    res.json({ ok: true, event });
  } catch (e) {
    log.error("adminGetOfferEvent", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error." });
  }
}

export async function adminUpdateOfferEvent(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const d = eventUpdateSchema.parse(req.body);
    const existing = await prisma.offerEvent.findFirst({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Not found." });
      return;
    }

    const startsAt =
      d.startsAt != null
        ? d.startsAt instanceof Date
          ? d.startsAt
          : new Date(d.startsAt)
        : existing.startsAt;
    const endsAt =
      d.endsAt != null ? (d.endsAt instanceof Date ? d.endsAt : new Date(d.endsAt)) : existing.endsAt;
    if (endsAt <= startsAt) {
      res.status(400).json({ ok: false, message: "endsAt must be after startsAt." });
      return;
    }

    const event = await prisma.offerEvent.update({
      where: { id },
      data: {
        ...(d.title != null && { title: d.title }),
        ...(d.description != null && { description: d.description }),
        ...(d.imageUrl !== undefined && { imageUrl: d.imageUrl || null }),
        startsAt,
        endsAt,
        ...(d.isActive != null && { isActive: d.isActive }),
      },
    });

    res.json({ ok: true, event });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, message: "Invalid data.", errors: e.issues });
      return;
    }
    log.error("adminUpdateOfferEvent", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error updating event." });
  }
}

export async function adminSoftDeleteOfferEvent(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    await prisma.offerEvent.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    res.json({ ok: true });
  } catch (e) {
    log.error("adminSoftDeleteOfferEvent", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error deleting event." });
  }
}

export async function adminListEventMiners(req: Request, res: Response): Promise<void> {
  try {
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      res.status(400).json({ ok: false, message: "Invalid event id." });
      return;
    }
    const event = await prisma.offerEvent.findFirst({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ ok: false, message: "Event not found." });
      return;
    }

    const miners = await prisma.eventMiner.findMany({
      where: { eventId },
      orderBy: { id: "asc" },
    });

    res.json({ ok: true, event, miners });
  } catch (e) {
    log.error("adminListEventMiners", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error." });
  }
}

export async function adminCreateEventMiner(req: Request, res: Response): Promise<void> {
  try {
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) {
      res.status(400).json({ ok: false, message: "Invalid event id." });
      return;
    }
    const event = await prisma.offerEvent.findFirst({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ ok: false, message: "Event not found." });
      return;
    }

    const d = minerCreateSchema.parse(req.body);
    const price = toDecimalPrice(d.price);

    const miner = await prisma.eventMiner.create({
      data: {
        eventId,
        name: d.name,
        description: d.description,
        imageUrl: d.imageUrl || null,
        price,
        hashRate: d.hashRate,
        currency: d.currency || DEFAULT_OFFER_CURRENCY,
        stockUnlimited: d.stockUnlimited,
        stockCount: d.stockUnlimited ? null : d.stockCount,
        slotSize: d.slotSize ?? 1,
        isActive: d.isActive !== false,
        isFree: d.isFree === true,
        claimLimitPerUser: d.claimLimitPerUser ?? 1,
      },
    });

    res.json({ ok: true, miner });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, message: "Invalid data.", errors: e.issues });
      return;
    }
    log.error("adminCreateEventMiner", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error creating miner." });
  }
}

export async function adminUpdateEventMiner(req: Request, res: Response): Promise<void> {
  try {
    const eventId = Number(req.params.eventId);
    const minerId = Number(req.params.minerId);
    if (!Number.isInteger(eventId) || !Number.isInteger(minerId)) {
      res.status(400).json({ ok: false, message: "Invalid ids." });
      return;
    }

    const existing = await prisma.eventMiner.findFirst({
      where: { id: minerId, eventId },
    });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Miner not found." });
      return;
    }

    const d = minerUpdateSchema.parse(req.body);

    let price: string | undefined;
    if (d.price != null) price = toDecimalPrice(d.price);

    const stockUnlimited = d.stockUnlimited !== undefined ? d.stockUnlimited : existing.stockUnlimited;
    const stockCount =
      d.stockCount !== undefined
        ? d.stockCount
        : d.stockUnlimited !== undefined && stockUnlimited
          ? null
          : existing.stockCount;

    const miner = await prisma.eventMiner.update({
      where: { id: minerId },
      data: {
        ...(d.name != null && { name: d.name }),
        ...(d.description != null && { description: d.description }),
        ...(d.imageUrl !== undefined && { imageUrl: d.imageUrl || null }),
        ...(price != null && { price }),
        ...(d.hashRate != null && { hashRate: d.hashRate }),
        ...(d.currency != null && { currency: d.currency }),
        ...(d.stockUnlimited !== undefined && { stockUnlimited: d.stockUnlimited }),
        ...(d.stockCount !== undefined || d.stockUnlimited !== undefined
          ? { stockCount: stockUnlimited ? null : stockCount }
          : {}),
        ...(d.slotSize != null && { slotSize: d.slotSize }),
        ...(d.isActive != null && { isActive: d.isActive }),
        ...(d.isFree !== undefined && { isFree: d.isFree }),
        ...(d.claimLimitPerUser !== undefined && { claimLimitPerUser: d.claimLimitPerUser }),
      },
    });

    const imageChanged =
      d.imageUrl !== undefined && String(existing.imageUrl ?? "") !== String(miner.imageUrl ?? "");
    if (imageChanged) {
      await repo.clearEventMinerOwnedImageSnapshots(existing.name);
      if (d.name != null && d.name !== existing.name) {
        await repo.clearEventMinerOwnedImageSnapshots(d.name);
      }
    }

    res.json({ ok: true, miner });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ ok: false, message: "Invalid data.", errors: e.issues });
      return;
    }
    log.error("adminUpdateEventMiner", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error updating miner." });
  }
}

export async function adminRemoveEventMiner(req: Request, res: Response): Promise<void> {
  try {
    const eventId = Number(req.params.eventId);
    const minerId = Number(req.params.minerId);
    const existing = await prisma.eventMiner.findFirst({
      where: { id: minerId, eventId },
      include: { _count: { select: { purchases: true } } },
    });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Miner not found." });
      return;
    }

    if (existing._count.purchases > 0) {
      await prisma.eventMiner.update({
        where: { id: minerId },
        data: { isActive: false },
      });
      res.json({ ok: true, deactivated: true });
      return;
    }

    await prisma.eventMiner.delete({ where: { id: minerId } });
    res.json({ ok: true, deleted: true });
  } catch (e) {
    log.error("adminRemoveEventMiner", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error removing miner." });
  }
}

export async function adminListEventPurchases(req: Request, res: Response): Promise<void> {
  try {
    const eventId = Number(req.params.id);
    const q = listPurchasesQuerySchema.safeParse(req.query || {});
    if (!q.success) {
      res.status(400).json({ ok: false, message: "Invalid query.", errors: q.error.issues });
      return;
    }
    const page = Math.max(1, q.data.page ?? 1);
    const pageSize = Math.min(
      ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX,
      Math.max(
        ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MIN,
        q.data.pageSize ?? ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_DEFAULT,
      ),
    );
    const skip = (page - 1) * pageSize;
    const filterUserId = q.data.userId;

    const event = await prisma.offerEvent.findFirst({ where: { id: eventId } });
    if (!event) {
      res.status(404).json({ ok: false, message: "Event not found." });
      return;
    }

    // One EventPurchase row = one unit (createMany × qty). Paginate checkout batches,
    // not raw units — otherwise qty=20 looks like 20 duplicate admin lines.
    type BatchRow = {
      id: number;
      userId: number;
      eventMinerId: number;
      currency: string;
      unitPrice: unknown;
      quantity: number;
      totalPaid: unknown;
      createdAt: Date;
    };

    const userFilter = filterUserId
      ? Prisma.sql`AND ep.user_id = ${filterUserId}`
      : Prisma.empty;

    const [batches, countRows, statsRows] = await Promise.all([
      prisma.$queryRaw<BatchRow[]>`
        SELECT
          MIN(ep.id)::int AS id,
          ep.user_id AS "userId",
          ep.event_miner_id AS "eventMinerId",
          ep.currency,
          ep.price_paid AS "unitPrice",
          COUNT(*)::int AS quantity,
          SUM(ep.price_paid) AS "totalPaid",
          MIN(ep.created_at) AS "createdAt"
        FROM event_purchases ep
        WHERE ep.event_id = ${eventId}
        ${userFilter}
        GROUP BY ep.user_id, ep.event_miner_id, ep.currency, ep.price_paid, ep.created_at
        ORDER BY MIN(ep.id) DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `,
      prisma.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(*)::int AS total FROM (
          SELECT 1
          FROM event_purchases ep
          WHERE ep.event_id = ${eventId}
          ${userFilter}
          GROUP BY ep.user_id, ep.event_miner_id, ep.currency, ep.price_paid, ep.created_at
        ) AS batches
      `,
      prisma.$queryRaw<
        Array<{
          unitSales: number;
          uniqueBuyers: number;
          checkoutBatches: number;
          revenuePol: unknown;
        }>
      >`
        SELECT
          COUNT(*)::int AS "unitSales",
          COUNT(DISTINCT ep.user_id)::int AS "uniqueBuyers",
          COUNT(DISTINCT (ep.user_id, ep.event_miner_id, ep.price_paid, ep.created_at))::int AS "checkoutBatches",
          COALESCE(SUM(CASE WHEN ep.currency = 'POL' THEN ep.price_paid ELSE 0 END), 0) AS "revenuePol"
        FROM event_purchases ep
        WHERE ep.event_id = ${eventId}
      `,
    ]);

    const total = countRows[0]?.total ?? 0;
    const stats = statsRows[0] ?? {
      unitSales: 0,
      uniqueBuyers: 0,
      checkoutBatches: 0,
      revenuePol: 0,
    };
    const userIds = [...new Set(batches.map((b) => b.userId))];
    const minerIds = [...new Set(batches.map((b) => b.eventMinerId))];

    const [users, miners] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, username: true, name: true },
          })
        : Promise.resolve([]),
      minerIds.length
        ? prisma.eventMiner.findMany({
            where: { id: { in: minerIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const minerById = new Map(miners.map((m) => [m.id, m]));

    res.json({
      ok: true,
      page,
      pageSize,
      total,
      stats: {
        unitSales: Number(stats.unitSales) || 0,
        uniqueBuyers: Number(stats.uniqueBuyers) || 0,
        checkoutBatches: Number(stats.checkoutBatches) || 0,
        revenuePol: Number(stats.revenuePol) || 0,
      },
      purchases: batches.map((b) => {
        const unitPrice = Number(b.unitPrice);
        const quantity = Number(b.quantity);
        const totalPaid = Number(b.totalPaid);
        return {
          id: b.id,
          userId: b.userId,
          eventMinerId: b.eventMinerId,
          pricePaid: unitPrice,
          unitPrice,
          quantity,
          totalPaid,
          currency: b.currency,
          createdAt: b.createdAt,
          user: userById.get(b.userId) ?? null,
          minerName: minerById.get(b.eventMinerId)?.name ?? null,
        };
      }),
    });
  } catch (e) {
    log.error("adminListEventPurchases", { error: String(e) });
    res.status(500).json({ ok: false, message: "Error listing purchases." });
  }
}
