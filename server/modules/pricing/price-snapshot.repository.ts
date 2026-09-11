// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/pricing/repositories/price-snapshot.repository.ts.
 * Persists immutable POL/USD (and future assets) price snapshots keyed by (asset, eventAt).
 */
import prisma from "../../core/database/prisma.js";
function toSnapshot(row) {
    return {
        id: row.id,
        asset: row.asset,
        eventAt: row.eventAt,
        priceUsd: Number(row.priceUsd),
        source: row.source,
        sourceRef: row.sourceRef,
    };
}
export async function findPriceSnapshot(asset, eventAt) {
    const row = await prisma.assetPriceSnapshot.findUnique({
        where: { asset_eventAt: { asset, eventAt } },
    });
    return row ? toSnapshot(row) : null;
}
export async function createPriceSnapshot(input) {
    const row = await prisma.assetPriceSnapshot.create({
        data: {
            asset: input.asset,
            eventAt: input.eventAt,
            priceUsd: input.priceUsd.toString(),
            source: input.source,
            sourceRef: input.sourceRef ?? null,
        },
    });
    return toSnapshot(row);
}
/** Idempotent — concurrent verifiers racing on the same (asset, eventAt) never error. */
export async function findOrCreatePriceSnapshot(input) {
    const existing = await findPriceSnapshot(input.asset, input.eventAt);
    if (existing)
        return existing;
    try {
        return await createPriceSnapshot(input);
    }
    catch {
        const again = await findPriceSnapshot(input.asset, input.eventAt);
        if (again)
            return again;
        throw new Error("Failed to create price snapshot");
    }
}
