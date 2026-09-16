import { z } from "zod";
import {
  ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX,
  ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MIN,
  ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX,
  ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MIN,
  OFFER_EVENT_PURCHASE_MAX_QUANTITY,
} from "./offer-events.config.js";

export const purchaseSchema = z
  .object({
    eventMinerId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().min(1).max(OFFER_EVENT_PURCHASE_MAX_QUANTITY).optional().default(1),
  })
  .strict();

/** Shape only — env `FAN_MAX_BULK_QUANTITY` is enforced in the controller. */
export const purchaseFanSchema = z
  .object({
    sku: z.string().trim().min(1).max(80),
    quantity: z.coerce.number().int().min(1),
  })
  .strict();

/** Shape only — env `RACK_MAX_BULK_QUANTITY` is enforced in the controller. */
export const purchaseRackSchema = z
  .object({
    sku: z.string().trim().min(1).max(80),
    quantity: z.coerce.number().int().min(1),
  })
  .strict();

export const eventCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(20000),
    imageUrl: z.string().trim().max(2000).optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const eventUpdateSchema = eventCreateSchema.partial();

export const minerCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(20000).optional().default(""),
    imageUrl: z.string().trim().max(2000).optional().nullable(),
    price: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)]),
    hashRate: z.number().positive(),
    currency: z.enum(["POL", "BLK", "BTC", "ETH", "USDT", "USDC", "ZER"]).optional(),
    stockUnlimited: z.boolean(),
    stockCount: z.number().int().positive().optional().nullable(),
    slotSize: z.coerce.number().int().pipe(z.union([z.literal(1), z.literal(2)])).optional(),
    isActive: z.boolean().optional(),
    isFree: z.boolean().optional(),
    claimLimitPerUser: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((d) => d.stockUnlimited || (d.stockCount != null && d.stockCount > 0), {
    message: "stockCount required when stock is limited",
  });

export const minerUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(20000).optional(),
    imageUrl: z.string().trim().max(2000).optional().nullable(),
    price: z.union([z.number().min(0), z.string().regex(/^\d+(\.\d+)?$/)]).optional(),
    hashRate: z.number().positive().optional(),
    currency: z.enum(["POL", "BLK", "BTC", "ETH", "USDT", "USDC", "ZER"]).optional(),
    stockUnlimited: z.boolean().optional(),
    stockCount: z.number().int().positive().optional().nullable(),
    slotSize: z.coerce.number().int().pipe(z.union([z.literal(1), z.literal(2)])).optional(),
    isActive: z.boolean().optional(),
    isFree: z.boolean().optional(),
    claimLimitPerUser: z.number().int().min(0).optional(),
  })
  .strict();

export const listEventsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce
      .number()
      .int()
      .min(ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MIN)
      .max(ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX)
      .optional(),
    includeDeleted: z.enum(["0", "1"]).optional(),
  })
  .strict();

export const listPurchasesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce
      .number()
      .int()
      .min(ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MIN)
      .max(ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX)
      .optional(),
    userId: z.coerce.number().int().min(1).optional(),
  })
  .strict();
