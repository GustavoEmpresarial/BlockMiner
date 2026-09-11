// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../../core/database/prisma.js";
export async function listTransactionsForUser(userId) {
    return prisma.transaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 });
}
