import { z } from "zod";

export const sidebarSectionSchema = z.enum(["main", "earn", "social"]);

export const sidebarPersistedEntrySchema = z
  .object({
    itemId: z.string().trim().min(1).max(64),
    visible: z.boolean(),
    sortOrder: z.number().int().min(0).max(10_000),
    section: sidebarSectionSchema,
    parentItemId: z.string().trim().min(1).max(64).nullable(),
  })
  .strict();

export const putSidebarNavSchema = z
  .object({
    entries: z.array(sidebarPersistedEntrySchema).min(1).max(100),
  })
  .strict();

export type PutSidebarNavInput = z.infer<typeof putSidebarNavSchema>;
