// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported from legacy/server/modules/offerwallme/infrastructure/repositories/offerwallme.repository.ts. */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { grantOfferwallPartInTx, reverseOfferwallPartInTx } from "../parts/parts.grant.js";
import { PART_GRANT_SOURCE } from "../parts/parts.drop.js";
import { OFFERWALL_CALLBACK_STATUS, type OfferwallReversalOutcome } from "../../shared/offerwallCallbackStatus.js";
export async function findUserForPostback(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isBanned: true },
    });
}
/**
 * Chargeback: flips the existing credit row (same trans_id) to CHARGEBACK, debits the BLK that
 * row credited (floored at 0) and reverses its part grant — one transaction. A chargeback with
 * no prior credit only stores an audit row so a late credit for that trans_id becomes a duplicate.
 */
export async function reverseCreditCallback(params): Promise<OfferwallReversalOutcome> {
    return prisma.$transaction(async (tx): Promise<OfferwallReversalOutcome> => {
        const credit = await tx.offerwallMeCallback.findUnique({ where: { transId: params.transId } });
        if (!credit) {
            await tx.offerwallMeCallback.create({
                data: {
                    userId: params.userId,
                    transId: params.transId,
                    offerName: params.offerName,
                    offerType: params.offerType,
                    payoutUsd: params.payoutUsd,
                    polCredited: 0,
                    polPrice: params.polPrice,
                    status: OFFERWALL_CALLBACK_STATUS.CHARGEBACK,
                    requestIp: params.clientIp,
                },
            });
            return { kind: "recorded_without_credit" };
        }
        if (credit.userId !== params.userId) {
            return { kind: "user_mismatch", ownerUserId: credit.userId };
        }
        const flipped = await tx.offerwallMeCallback.updateMany({
            where: { id: credit.id, status: OFFERWALL_CALLBACK_STATUS.CREDIT },
            data: { status: OFFERWALL_CALLBACK_STATUS.CHARGEBACK },
        });
        if (flipped.count === 0) {
            return { kind: "already_reversed" };
        }
        const debit = new Prisma.Decimal(credit.polCredited);
        if (debit.greaterThan(0)) {
            await tx.user.update({
                where: { id: credit.userId },
                data: { blkBalance: { decrement: debit } },
            });
            const after = await tx.user.findUnique({ where: { id: credit.userId }, select: { blkBalance: true } });
            if (after && after.blkBalance.lessThan(0)) {
                await tx.user.update({ where: { id: credit.userId }, data: { blkBalance: new Prisma.Decimal(0) } });
            }
        }
        await reverseOfferwallPartInTx(tx, {
            source: PART_GRANT_SOURCE.offerwallme,
            sourceRef: String(params.transId ?? ""),
        });
        return { kind: "reversed", creditedAt: credit.createdAt };
    });
}
/** Credit (status!=2): credit the user's BLK inside a single transaction. */
export async function createCreditCallback(params) {
    return prisma.$transaction(async (tx) => {
        const created = await tx.offerwallMeCallback.create({
            data: {
                userId: params.userId,
                transId: params.transId,
                offerName: params.offerName,
                offerType: params.offerType,
                payoutUsd: params.payoutUsd,
                polCredited: Number(params.polDecimal),
                polPrice: params.polPrice,
                status: params.status,
                requestIp: params.clientIp,
            },
        });
        await tx.user.update({
            where: { id: params.userId },
            data: { blkBalance: { increment: params.polDecimal } },
        });
        await grantOfferwallPartInTx(tx, {
            userId: params.userId,
            source: PART_GRANT_SOURCE.offerwallme,
            sourceRef: String(params.transId ?? ""),
            usdAmount: params.polDecimal,
        });
        return created;
    });
}
export async function listCallbackHistory(userId, skip, take) {
    const [entries, total] = await Promise.all([
        prisma.offerwallMeCallback.findMany({
            where: { userId, status: 1 },
            orderBy: { createdAt: "desc" },
            skip,
            take,
            select: {
                id: true,
                offerName: true,
                offerType: true,
                payoutUsd: true,
                polCredited: true,
                polPrice: true,
                createdAt: true,
            },
        }),
        prisma.offerwallMeCallback.count({ where: { userId, status: 1 } }),
    ]);
    return { entries, total };
}
export async function getStatsAggregates(userId, startOfDay, startOfWeek, startOfMonth) {
    const [agg, offersToday, offersWeek, offersMonth] = await Promise.all([
        prisma.offerwallMeCallback.aggregate({
            where: { userId, status: 1 },
            _sum: { payoutUsd: true, polCredited: true },
            _count: { id: true },
        }),
        prisma.offerwallMeCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfDay } } }),
        prisma.offerwallMeCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfWeek } } }),
        prisma.offerwallMeCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfMonth } } }),
    ]);
    return { agg, offersToday, offersWeek, offersMonth };
}
