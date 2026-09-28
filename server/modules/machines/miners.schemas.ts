import { z } from "zod";

export const minerIdParamSchema = z.object({
  id: z.coerce.number().int().positive().max(2_147_483_647, "ID exceeds maximum 32-bit integer"),
});

export const createMinerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  slug: z
    .string()
    .trim()
    .max(80, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers and hyphens")
    .optional(),
  description: z.string().max(500, "Description too long").nullable().optional(),
  baseHashRate: z.coerce.number().min(0, "Hashrate cannot be negative").max(10_000_000_000, "Hashrate exceeds limit"),
  price: z.coerce.number().min(0, "Price cannot be negative").max(1_000_000, "Price exceeds limit"),
  slotSize: z.coerce.number().int().min(1).max(2).default(1),
  imageUrl: z.string().trim().max(500, "Image URL too long").nullable().optional(),
  tier: z.string().trim().max(50).default("common"),
  sourceType: z.string().trim().max(50).default("store"),
  isActive: z.boolean().default(true),
  showInShop: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const updateMinerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long").optional(),
  slug: z
    .string()
    .trim()
    .max(80, "Slug too long")
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers and hyphens")
    .optional(),
  description: z.string().max(500, "Description too long").nullable().optional(),
  baseHashRate: z.coerce.number().min(0, "Hashrate cannot be negative").max(10_000_000_000, "Hashrate exceeds limit").optional(),
  price: z.coerce.number().min(0, "Price cannot be negative").max(1_000_000, "Price exceeds limit").optional(),
  slotSize: z.coerce.number().int().min(1).max(2).optional(),
  imageUrl: z.string().trim().max(500, "Image URL too long").nullable().optional(),
  tier: z.string().trim().max(50).optional(),
  sourceType: z.string().trim().max(50).optional(),
  isActive: z.boolean().optional(),
  showInShop: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const relinkOrphanSchema = z.object({
  minerName: z.string().trim().min(1, "minerName is required").max(150, "minerName too long"),
});

export const assignBrokenMachineSchema = z
  .object({
    minerName: z.string().trim().min(1, "minerName is required").max(150, "minerName too long"),
    hashRate: z.coerce.number().min(0, "hashRate cannot be negative"),
    location: z.enum(["RACK", "INVENTORY", "WAREHOUSE"]),
    catalogMinerId: z.coerce.number().int().positive().max(2_147_483_647).optional().nullable(),
    eventMinerId: z.coerce.number().int().positive().max(2_147_483_647).optional().nullable(),
  })
  .refine(
    (data) => {
      const hasCatalog = Number.isSafeInteger(data.catalogMinerId) && (data.catalogMinerId ?? 0) > 0;
      const hasEvent = Number.isSafeInteger(data.eventMinerId) && (data.eventMinerId ?? 0) > 0;
      return hasCatalog !== hasEvent;
    },
    { message: "Provide exactly one catalogMinerId or eventMinerId." },
  );

export const minerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  includeArchived: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((val) => val === "1" || val === "true"),
});
