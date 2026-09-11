// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported from legacy energy-tax/infrastructure/repositories/energyTax.repository.ts. */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { taxPayBalanceField, } from "../../shared/taxPaymentCurrency.js";
export async function listChargesInWindow(userId, gte, lt) {
    return prisma.energyTaxCharge.findMany({
        where: { userId, periodDayStartsAt: { gte, lt } },
        select: { periodDayStartsAt: true },
    });
}
export async function listChargesInWindowFull(userId, gte, lt) {
    return prisma.energyTaxCharge.findMany({
        where: { userId, periodDayStartsAt: { gte, lt } },
    });
}
export async function listRecentCharges(userId, take) {
    return prisma.energyTaxCharge.findMany({
        where: { userId },
        orderBy: { id: "desc" },
        take,
    });
}
export async function findChargeForDay(userId, periodDayStartsAt) {
    return prisma.energyTaxCharge.findUnique({
        where: { userId_periodDayStartsAt: { userId, periodDayStartsAt } },
    });
}
export async function findUserEnergyBlocked(userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: { energyBlocked: true } });
}
export async function clearUserEnergyBlock(userId) {
    await prisma.user.update({
        where: { id: userId },
        data: { energyBlocked: false, energyBlockedAt: null },
    });
}
export async function createExemptCharge(data) {
    return prisma.energyTaxCharge.create({
        data: {
            userId: data.userId,
            periodDayStartsAt: data.periodDayStartsAt,
            mode: "exempt",
            rewardsBase: data.rewardsBase,
            ratePercent: new Prisma.Decimal("0"),
            amount: new Prisma.Decimal("0"),
            status: "paid",
            notes: data.notes,
        },
    });
}
export async function findUserTaxBalancesTx(tx, userId) {
    return tx.user.findUnique({
        where: { id: userId },
        select: { polBalance: true, blkBalance: true, shibBalance: true },
    });
}
/** @deprecated Prefer findUserTaxBalancesTx — kept for weekly sweep POL path. */
export async function findUserPolBalanceTx(tx, userId) {
    return tx.user.findUnique({ where: { id: userId }, select: { polBalance: true } });
}
export async function createTaxTransactionTx(tx, userId, amount, currency = "POL") {
    return tx.transaction.create({
        data: {
            userId,
            type: "energy_tax",
            amount,
            status: "completed",
            completedAt: new Date(),
            // Reuse optional address slot to record settlement currency (no schema migration).
            address: currency === "POL" ? null : currency,
        },
    });
}
export async function decrementUserBalanceTx(tx, userId, currency, amount) {
    const field = taxPayBalanceField(currency);
    await tx.user.update({
        where: { id: userId },
        data: { [field]: { decrement: amount } },
    });
}
/** @deprecated Prefer decrementUserBalanceTx */
export async function decrementUserPolBalanceTx(tx, userId, amount) {
    await decrementUserBalanceTx(tx, userId, "POL", amount);
}
export async function createChargeTx(tx, data) {
    return tx.energyTaxCharge.create({ data });
}
export async function findUserBalances(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { polBalance: true, blkBalance: true, shibBalance: true },
    });
}
