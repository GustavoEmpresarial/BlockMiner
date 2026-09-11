// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/tournaments/infrastructure/blockchain/block-timestamp.resolver.ts.
 * Resolves the canonical on-chain block timestamp (UTC) — called once per deposit confirmation
 * to fix the immutable USD valuation moment.
 */
import { getSharedPolygonProvider } from "./polygonProvider.js";
export async function resolveBlockTimestamp(blockNumber) {
    const provider = getSharedPolygonProvider();
    const block = await provider.getBlock(blockNumber);
    if (!block?.timestamp) {
        throw new Error(`Block ${blockNumber} timestamp unavailable`);
    }
    return new Date(Number(block.timestamp) * 1000);
}
