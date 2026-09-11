// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
export async function findUserBalances(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { polBalance: true, shibBalance: true, blkBalance: true },
    });
}
export async function findUserBalancesTx(tx, userId) {
    return tx.user.findUnique({
        where: { id: userId },
        select: { polBalance: true, shibBalance: true, blkBalance: true },
    });
}
export async function updatePolToBlkTx(tx, userId, amountNum, output) {
    await tx.user.update({
        where: { id: userId },
        data: {
            polBalance: { decrement: amountNum },
            blkBalance: { increment: output },
        },
    });
}
export async function updateShibToBlkTx(tx, userId, amountNum, output) {
    await tx.user.update({
        where: { id: userId },
        data: {
            shibBalance: { decrement: amountNum },
            blkBalance: { increment: output },
        },
    });
}
