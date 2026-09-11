// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { z } from "zod";
export const installMinerBodySchema = z
    .object({
    rackId: z.coerce.number().int().positive(),
    inventoryId: z.coerce.number().int().positive(),
})
    .strict();
export const uninstallMinerBodySchema = z
    .object({
    rackId: z.coerce.number().int().positive(),
})
    .strict();
export const uninstallMinerBatchBodySchema = z
    .object({
    rackIds: z.array(z.coerce.number().int().positive()).min(1),
})
    .strict();
export function normalizeRackIds(raw) {
    if (!Array.isArray(raw))
        return [];
    return [...new Set(raw.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}
