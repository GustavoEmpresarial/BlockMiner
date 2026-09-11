/** Ported from legacy/server/modules/partnerGames/infrastructure/repositories/partnerGames.repository.ts. */
import type { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";

export async function listVisiblePartnerGames() {
  return prisma.partnerGame.findMany({
    where: { isVisible: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImageUrl: true,
      iframeUrl: true,
      fallbackUrl: true,
      partnerUrl: true,
      launchMode: true,
      embedStatus: true,
      embedBlockReason: true,
      embedProbedAt: true,
    },
  });
}

export async function groupVoteCountsForGames(gameIds: number[]) {
  return prisma.partnerGameVote.groupBy({
    by: ["partnerGameId", "value"],
    where: { partnerGameId: { in: gameIds } },
    _count: { _all: true },
  });
}

export async function listUserVotesForGames(userId: number, gameIds: number[]) {
  return prisma.partnerGameVote.findMany({
    where: { userId, partnerGameId: { in: gameIds } },
    select: { partnerGameId: true, value: true },
  });
}

export async function findVisiblePartnerGameById(id: number) {
  return prisma.partnerGame.findUnique({
    where: { id },
    select: { id: true, isVisible: true },
  });
}

export async function findVote(userId: number, partnerGameId: number) {
  return prisma.partnerGameVote.findUnique({
    where: { userId_partnerGameId: { userId, partnerGameId } },
  });
}

export async function deleteVote(id: number): Promise<void> {
  await prisma.partnerGameVote.delete({ where: { id } });
}

export async function createVote(userId: number, partnerGameId: number, value: number): Promise<void> {
  await prisma.partnerGameVote.create({ data: { userId, partnerGameId, value } });
}

export async function updateVote(id: number, value: number): Promise<void> {
  await prisma.partnerGameVote.update({ where: { id }, data: { value } });
}

export async function groupVoteCountsForGame(partnerGameId: number) {
  return prisma.partnerGameVote.groupBy({
    by: ["value"],
    where: { partnerGameId },
    _count: { _all: true },
  });
}

export async function listAllPartnerGamesAdmin() {
  return prisma.partnerGame.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
}

export async function createPartnerGame(data: Prisma.PartnerGameCreateInput) {
  return prisma.partnerGame.create({ data });
}

export async function findPartnerGameById(id: number) {
  return prisma.partnerGame.findUnique({ where: { id } });
}

export async function updatePartnerGame(id: number, data: Prisma.PartnerGameUpdateInput): Promise<void> {
  await prisma.partnerGame.update({ where: { id }, data });
}

export async function deletePartnerGame(id: number): Promise<void> {
  await prisma.partnerGame.delete({ where: { id } });
}
