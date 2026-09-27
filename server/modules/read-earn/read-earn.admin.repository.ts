import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";

export async function listCampaigns() {
  return prisma.readEarnCampaign.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
    include: { _count: { select: { redemptions: true } } },
  });
}

export async function createCampaign(data: Prisma.ReadEarnCampaignCreateInput) {
  return prisma.readEarnCampaign.create({
    data,
    include: { _count: { select: { redemptions: true } } },
  });
}

export async function findCampaignById(id: number) {
  return prisma.readEarnCampaign.findUnique({ where: { id } });
}

export async function updateCampaign(id: number, data: Prisma.ReadEarnCampaignUpdateInput) {
  return prisma.readEarnCampaign.update({
    where: { id },
    data,
    include: { _count: { select: { redemptions: true } } },
  });
}

export async function countRedemptionsForCampaign(campaignId: number): Promise<number> {
  return prisma.readEarnRedemption.count({ where: { campaignId } });
}

export async function deleteCampaign(id: number): Promise<void> {
  await prisma.readEarnCampaign.delete({ where: { id } });
}

export async function findCampaignTitleById(id: number) {
  return prisma.readEarnCampaign.findUnique({ where: { id }, select: { id: true, title: true } });
}

export async function listRedemptionsForCampaign(campaignId: number, skip: number, take: number) {
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

