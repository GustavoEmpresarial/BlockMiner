// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
export async function findUsernameConflict(username, excludeUserId) {
    return prisma.user.findFirst({ where: { username, id: { not: excludeUserId } } });
}
export async function updateUsername(userId, username) {
    await prisma.user.update({ where: { id: userId }, data: { username, name: username } });
}
export async function findUserById(userId) {
    return prisma.user.findUnique({ where: { id: userId } });
}
export async function updateUser2FAFields(userId, data) {
    await prisma.user.update({ where: { id: userId }, data });
}
export async function createAdblockAuditLog(data) {
    await prisma.auditLog.create({ data });
}
export async function listReferralsForUser(userId) {
    return prisma.referral.findMany({
        where: { referrerId: userId },
        include: { referred: { select: { id: true, username: true, name: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
    });
}
export async function findReferralByReferredId(userId) {
    return prisma.referral.findUnique({ where: { referredId: userId } });
}
export async function findUserByRefCode(refCode) {
    return prisma.user.findUnique({ where: { refCode } });
}
export async function createReferralAndLinkTx(referrerId, referredId) {
    await prisma.$transaction([
        prisma.referral.create({ data: { referrerId, referredId } }),
        prisma.user.update({ where: { id: referredId }, data: { referredBy: referrerId } }),
    ]);
}
export async function findUserEmailTwoFactorEnabled(userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: { emailTwoFactorEnabled: true } });
}
export async function findUserEmailAndName(userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
}
export async function setEmailTwoFactorEnabled(userId, enabled) {
    await prisma.user.update({ where: { id: userId }, data: { emailTwoFactorEnabled: enabled } });
}
export async function countReferralsForUser(userId) {
    return prisma.referral.count({ where: { referrerId: userId } });
}
