// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { z } from "zod";
export const VAULT_BULK_MAX = 120;
/** `source: "rack"` moves a single active rack machine (by `itemId`) straight into
 *  the vault — bulk `itemIds` only applies to the `"inventory"` source. */
export const moveToVaultBodySchema = z
    .object({
    source: z.enum(["inventory", "rack"]),
    itemId: z.coerce.number().int().positive().optional(),
    itemIds: z.array(z.coerce.number().int().positive()).min(1).max(VAULT_BULK_MAX).optional(),
})
    .strict();
/** `destination: "rack"` retrieves a single vault item (by `vaultId`) into a specific
 *  rack `slotIndex` — bulk `vaultIds` only applies to the `"inventory"` destination. */
export const retrieveFromVaultBodySchema = z
    .object({
    destination: z.enum(["inventory", "rack"]),
    vaultId: z.coerce.number().int().positive().optional(),
    vaultIds: z.array(z.coerce.number().int().positive()).min(1).max(VAULT_BULK_MAX).optional(),
    slotIndex: z.coerce.number().int().min(0).max(79).optional(),
})
    .strict();
