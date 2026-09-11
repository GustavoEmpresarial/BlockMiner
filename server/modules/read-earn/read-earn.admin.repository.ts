// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
export async function listCampaigns() {
    return prisma.readEarnCampaign.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "desc" }], include: { _count: { select: { redemptions: true } } } });
}
export async function createCampaign(data) {
    return prisma.readEarnCampaign.create({ data, include: { _count: { select: { redemptions: true } } } });
}
export async function findCampaignById(id) {
    return prisma.readEarnCampaign.findUnique({ where: { id } });
}
export async function updateCampaign(id, data) {
    return prisma.readEarnCampaign.update({ where: { id }, data, include: { _count: { select: { redemptions: true } } } });
}
export async function countRedemptionsForCampaign(campaignId) {
    return prisma.readEarnRedemption.count({ where: { campaignId } });
}
export async function deleteCampaign(id) {
    await prisma.readEarnCampaign.delete({ where: { id } });
}
export async function findCampaignTitleById(id) {
    return prisma.readEarnCampaign.findUnique({ where: { id }, select: { id: true, title: true } });
}
export async function listRedemptionsForCampaign(campaignId, skip, take) {
    const [rows, total] = await Promise.all([
        prisma.readEarnRedemption.findMany({
            where: { campaignId },
            orderBy: { redeemedAt: "desc" },
            skip,
            take,
            include: { user: { select: { id: true, username: true, email: true } } },
        }),
        prisma.readEarnRedemption.count({ where: { campaignId } }),
    ]);
    return { rows, total };
}
