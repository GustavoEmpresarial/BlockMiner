/**
 * Production may run code before Auto Mining v2 migrations are applied.
 * Probes Prisma v2 models; retries periodically after failure so deploy + migrate self-heals
 * without restart. Ported 1:1 from
 * legacy/server/modules/auto-mining/infrastructure/repositories/auto-mining.db-availability.ts.
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { V2_NEGATIVE_CACHE_MS } from "./auto-mining.config.js";
const log = logger.child("AutoMiningV2Db");
let schemaConfirmed = false;
let probeQuietUntil = 0;
export function resetAutoMiningV2AvailabilityCache() {
    schemaConfirmed = false;
    probeQuietUntil = 0;
}
export async function isAutoMiningV2SchemaAvailable() {
    const now = Date.now();
    if (schemaConfirmed)
        return true;
    if (now < probeQuietUntil)
        return false;
    try {
        await prisma.autoMiningV2PowerGrant.findFirst({ select: { id: true } });
        schemaConfirmed = true;
        return true;
    }
    catch (e) {
        log.warn("Auto Mining v2 tables unavailable; will retry probe later.", {
            message: e instanceof Error ? e.message : String(e),
        });
        probeQuietUntil = now + V2_NEGATIVE_CACHE_MS;
        return false;
    }
}
