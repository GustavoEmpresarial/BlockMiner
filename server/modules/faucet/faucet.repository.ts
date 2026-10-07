/** Ported from legacy/server/modules/faucet/faucet.repository.ts. */
import type { FaucetClaim } from "@prisma/client";
import prisma from "../../core/database/prisma.js";

export async function findActiveFaucetReward() {
  return prisma.faucetReward.findFirst({ where: { isActive: true }, include: { miner: true }, orderBy: { id: "asc" } });
}

export async function findFaucetClaimByUserId(userId: number) {
  return prisma.faucetClaim.findUnique({ where: { userId } });
}

export async function resetFaucetClaimDayKey(userId: number, todayKey: string): Promise<FaucetClaim> {
  return prisma.faucetClaim.update({ where: { userId }, data: { totalClaims: 0, dayKey: todayKey } });
}

export async function findFaucetPartnerVisitLatest(userId: number) {
  return prisma.faucetPartnerVisit.findFirst({ where: { userId }, orderBy: { openedAt: "desc" } });
}

export async function upsertFaucetPartnerVisit(userId: number, dayKey: string, openedAt: Date, eligibleAt: Date) {
  const now = new Date();
  return prisma.faucetPartnerVisit.upsert({
    where: { userId_dayKey: { userId, dayKey } },
    update: { openedAt, eligibleAt, updatedAt: now },
    create: { userId, dayKey, openedAt, eligibleAt },
  });
}

/** Separate from the visit upsert so a failed write cannot roll the visit back. */
export async function setFaucetPartnerVisitSource(userId: number, dayKey: string, source: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE faucet_partner_visits
    SET source = ${source}
    WHERE user_id = ${userId} AND day_key = ${dayKey}
  `;
}

export async function readFaucetPartnerVisitSource(userId: number): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ source: string | null }>>`
    SELECT source
    FROM faucet_partner_visits
    WHERE user_id = ${userId}
    ORDER BY opened_at DESC
    LIMIT 1
  `;
  return rows[0]?.source ?? null;
}
