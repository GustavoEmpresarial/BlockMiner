import { z } from "zod";

export const DEFAULT_SHOP_MAX_BULK_QUANTITY = 25;

export function readShopMaxBulkQuantity(): number {
  const raw = Number(process.env.SHOP_MAX_BULK_QUANTITY || DEFAULT_SHOP_MAX_BULK_QUANTITY);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_SHOP_MAX_BULK_QUANTITY;
}

export const listMinersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(6).max(48).default(24),
});

export type ListMinersQuery = z.infer<typeof listMinersQuerySchema>;

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[0-9a-zA-Z._-]+$/, "Invalid idempotency key format")
  .optional();

export function createPurchaseMinerSchema(maxBulk: number = readShopMaxBulkQuantity()) {
  return z
    .object({
      minerId: z.coerce.number().int().positive({ message: "Invalid miner ID" }),
      quantity: z.coerce
        .number()
        .int()
        .min(1, { message: "Quantity must be at least 1" })
        .max(maxBulk, { message: `Quantity must be between 1 and ${maxBulk}` })
        .default(1),
      idempotencyKey: idempotencyKeySchema,
    })
    .passthrough(); // allows other fields without crashing while validating core fields
}

export function createPurchaseFanSchema(maxBulk: number = readShopMaxBulkQuantity()) {
  return z
    .object({
      sku: z.string().trim().min(1, { message: "Invalid fan product" }).max(100),
      quantity: z.coerce
        .number()
        .int()
        .min(1, { message: "Quantity must be at least 1" })
        .max(maxBulk, { message: `Quantity must be between 1 and ${maxBulk}` })
        .default(1),
      idempotencyKey: idempotencyKeySchema,
    })
    .passthrough();
}

export function createPurchaseRackSchema(maxBulk: number = readShopMaxBulkQuantity()) {
  return z
    .object({
      sku: z.string().trim().min(1, { message: "Invalid rack product" }).max(100),
      quantity: z.coerce
        .number()
        .int()
        .min(1, { message: "Quantity must be at least 1" })
        .max(maxBulk, { message: `Quantity must be between 1 and ${maxBulk}` })
        .default(1),
      idempotencyKey: idempotencyKeySchema,
    })
    .passthrough();
}

export const purchaseMinerSchema = createPurchaseMinerSchema();
export const purchaseFanSchema = createPurchaseFanSchema();
export const purchaseRackSchema = createPurchaseRackSchema();

export type PurchaseMinerInput = z.infer<typeof purchaseMinerSchema>;
export type PurchaseFanInput = z.infer<typeof purchaseFanSchema>;
export type PurchaseRackInput = z.infer<typeof purchaseRackSchema>;
