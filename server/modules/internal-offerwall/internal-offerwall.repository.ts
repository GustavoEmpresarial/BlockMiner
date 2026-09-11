/** Prisma access for internal-offerwall — ported from legacy's application/internal-offerwall.service.ts
 *  (query bodies) + infrastructure/repositories/*.ts, flattened per doctrine (no domain/infrastructure split). */
import { Prisma } from "@prisma/client";
import prisma, { type TxClient } from "../../core/database/prisma.js";
import { ATTEMPT_STATUS_COMPLETED, ATTEMPT_STATUS_PENDING_REVIEW, ATTEMPT_STATUS_STARTED } from "./internal-offerwall.config.js";

export const COMPLETION_HISTORY_LOOKBACK_MS = 8 * 86_400_000;

export async function abandonStaleStartedAttempts(userId: number, periodKey: string): Promise<void> {
  const raw = String(process.env.INTERNAL_OFFERWALL_ABANDON_STARTED_AFTER_SEC || "").trim();
  const parsed = raw ? parseInt(raw, 10) : 86_400;
  const sec = Number.isFinite(parsed) && parsed >= 300 ? parsed : 86_400;
  const cutoff = new Date(Date.now() - sec * 1000);
  await prisma.internalOfferwallAttempt.deleteMany({
    where: { userId, periodKey, status: ATTEMPT_STATUS_STARTED, startedAt: { lt: cutoff } },
  });
}

export async function findActiveOffers() {
  return prisma.internalOfferwallOffer.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export async function findOpenAttemptsForUser(userId: number, periodKey: string) {
  return prisma.internalOfferwallAttempt.findMany({
    where: {
      userId,
      periodKey,
      status: { in: [ATTEMPT_STATUS_STARTED, ATTEMPT_STATUS_PENDING_REVIEW] },
      offer: { isActive: true },
    },
    include: { offer: true },
  });
}

export async function findCompletionRowsForOffers(userId: number, offerIds: number[], since: Date) {
  if (!offerIds.length) return [];
  return prisma.internalOfferwallAttempt.findMany({
    where: { userId, offerId: { in: offerIds }, status: ATTEMPT_STATUS_COMPLETED, completedAt: { not: null, gte: since } },
    select: { offerId: true, periodKey: true, completedAt: true },
  });
}

export async function findCompletionRowsForOfferTx(tx: TxClient, userId: number, offerId: number, since: Date) {
  return tx.internalOfferwallAttempt.findMany({
    where: { userId, offerId, status: ATTEMPT_STATUS_COMPLETED, completedAt: { not: null, gte: since } },
    select: { periodKey: true, completedAt: true },
  });
}

export async function findOfferByIdActiveTx(tx: TxClient, offerId: number) {
  return tx.internalOfferwallOffer.findFirst({ where: { id: offerId, isActive: true } });
}

export async function findOpenAttemptTx(tx: TxClient, userId: number, offerId: number, periodKey: string) {
  return tx.internalOfferwallAttempt.findFirst({
    where: { userId, offerId, periodKey, status: { in: [ATTEMPT_STATUS_STARTED, ATTEMPT_STATUS_PENDING_REVIEW] } },
  });
}

export async function createAttemptTx(
  tx: TxClient,
  args: { userId: number; offerId: number; periodKey: string; startedAt: Date },
) {
  return tx.internalOfferwallAttempt.create({
    data: {
      userId: args.userId,
      offerId: args.offerId,
      periodKey: args.periodKey,
      status: ATTEMPT_STATUS_STARTED,
      startedAt: args.startedAt,
    },
  });
}

export async function findAttemptForUser(userId: number, attemptId: number) {
  return prisma.internalOfferwallAttempt.findFirst({ where: { id: attemptId, userId }, include: { offer: true } });
}

export async function findAttemptForUserSlim(userId: number, attemptId: number) {
  return prisma.internalOfferwallAttempt.findFirst({ where: { id: attemptId, userId }, select: { id: true, status: true } });
}

export async function updatePartnerOpenedAtTx(tx: TxClient, attemptId: number, at: Date) {
  return tx.internalOfferwallAttempt.update({ where: { id: attemptId }, data: { partnerOpenedAt: at } });
}

export async function deleteStartedAttempt(userId: number, attemptId: number) {
  return prisma.internalOfferwallAttempt.deleteMany({ where: { id: attemptId, userId, status: ATTEMPT_STATUS_STARTED } });
}

export async function markPendingReviewTx(tx: TxClient, attemptId: number, submittedAt: Date, auditSnapshot: string) {
  return tx.internalOfferwallAttempt.update({
    where: { id: attemptId },
    data: { status: ATTEMPT_STATUS_PENDING_REVIEW, submittedAt, auditSnapshot },
  });
}

export async function findStartedAttemptTx(tx: TxClient, attemptId: number, userId: number) {
  return tx.internalOfferwallAttempt.findFirst({ where: { id: attemptId, userId, status: ATTEMPT_STATUS_STARTED } });
}

export async function markCompletedTx(
  tx: TxClient,
  attemptId: number,
  args: { submittedAt: Date; completedAt: Date; rewardGrantedAt: Date; auditSnapshot: string },
) {
  return tx.internalOfferwallAttempt.update({
    where: { id: attemptId },
    data: {
      status: ATTEMPT_STATUS_COMPLETED,
      submittedAt: args.submittedAt,
      completedAt: args.completedAt,
      rewardGrantedAt: args.rewardGrantedAt,
      auditSnapshot: args.auditSnapshot,
    },
  });
}

export async function findPendingAttemptWithOffer(attemptId: number) {
  return prisma.internalOfferwallAttempt.findFirst({ where: { id: attemptId, status: ATTEMPT_STATUS_PENDING_REVIEW }, include: { offer: true } });
}

export async function findPendingAttemptTx(tx: TxClient, attemptId: number) {
  return tx.internalOfferwallAttempt.findFirst({ where: { id: attemptId, status: ATTEMPT_STATUS_PENDING_REVIEW } });
}

export async function markApprovedTx(tx: TxClient, attemptId: number, completedAt: Date, rewardGrantedAt: Date) {
  return tx.internalOfferwallAttempt.update({
    where: { id: attemptId },
    data: { status: ATTEMPT_STATUS_COMPLETED, completedAt, rewardGrantedAt },
  });
}

export async function findPendingAttemptById(attemptId: number) {
  return prisma.internalOfferwallAttempt.findFirst({ where: { id: attemptId, status: ATTEMPT_STATUS_PENDING_REVIEW } });
}

export async function markRejected(attemptId: number, note: string | null) {
  return prisma.internalOfferwallAttempt.update({
    where: { id: attemptId },
    data: { status: "REJECTED", completedAt: new Date(), adminNote: note },
  });
}

// ---- Admin: offers ----

export async function adminListOffers() {
  return prisma.internalOfferwallOffer.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
}

export async function adminFindOfferById(id: number) {
  return prisma.internalOfferwallOffer.findUnique({ where: { id } });
}

export async function adminCreateOffer(data: Prisma.InternalOfferwallOfferUncheckedCreateInput) {
  return prisma.internalOfferwallOffer.create({ data });
}

export async function adminPatchOffer(id: number, patch: Prisma.InternalOfferwallOfferUncheckedUpdateInput) {
  return prisma.internalOfferwallOffer.update({ where: { id }, data: patch });
}

export async function adminListAttempts({ status, offerId, limit }: { status?: string; offerId?: number; limit?: number }) {
  const where: Prisma.InternalOfferwallAttemptWhereInput = {};
  if (status) where.status = status;
  if (offerId) where.offerId = offerId;
  return prisma.internalOfferwallAttempt.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    take: Math.min(200, Math.max(1, limit || 50)),
    include: {
      offer: { select: { id: true, title: true, kind: true } },
      user: { select: { id: true, email: true, username: true } },
    },
  });
}

// ---- Admin: frame hosts ----

export async function adminListFrameHosts() {
  return prisma.internalOfferwallFrameHost.findMany({
    orderBy: { hostname: "asc" },
    select: { id: true, hostname: true, isActive: true, createdAt: true },
  });
}

export async function adminFindFrameHostById(id: number) {
  return prisma.internalOfferwallFrameHost.findUnique({ where: { id } });
}

export async function adminDeactivateFrameHost(id: number) {
  return prisma.internalOfferwallFrameHost.update({ where: { id }, data: { isActive: false } });
}

// ---- Audit snapshot (user context captured at submit/approve time) ----

export async function buildUserAuditSnapshotJson(userId: number): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      walletAddress: true,
      polBalance: true,
      blkBalance: true,
      createdAt: true,
      miners: {
        take: 20,
        where: { isActive: true },
        select: {
          id: true,
          slotIndex: true,
          imageUrl: true,
          level: true,
          hashRate: true,
          miner: { select: { name: true, slug: true } },
        },
      },
      inventory: { take: 15, select: { id: true, minerName: true, imageUrl: true, level: true } },
      _count: { select: { transactions: true, payouts: true } },
    },
  });
  if (!user) return JSON.stringify({ error: "user_not_found", userId });
  const activeMinerSample = user.miners.map((m) => ({
    id: m.id,
    slotIndex: m.slotIndex,
    minerName: m.miner?.name ?? null,
    minerSlug: m.miner?.slug ?? null,
    imageUrl: m.imageUrl,
    level: m.level,
    hashRate: m.hashRate,
  }));
  const snap = {
    userId: user.id,
    email: user.email,
    username: user.username,
    walletAddress: user.walletAddress,
    polBalance: user.polBalance?.toString?.() ?? String(user.polBalance),
    blkBalance: user.blkBalance?.toString?.() ?? String(user.blkBalance),
    createdAt: user.createdAt?.toISOString?.() ?? null,
    activeMinerSample,
    inventorySample: user.inventory,
    transactionCount: user._count.transactions,
    payoutCount: user._count.payouts,
    capturedAt: new Date().toISOString(),
  };
  const s = JSON.stringify(snap);
  return s.length > 60_000 ? s.slice(0, 60_000) : s;
}

// ---- Reward grant (financial mutation, inside caller's tx) ----

const OFFERWALL_GAME_SLUG = "internal_offerwall_power";

async function getOrCreateOfferwallGameId(tx: TxClient): Promise<number> {
  const g = await tx.game.upsert({
    where: { slug: OFFERWALL_GAME_SLUG },
    create: { name: "Offerwall Temporary Power", slug: OFFERWALL_GAME_SLUG, isActive: true },
    update: {},
  });
  return g.id;
}

export { getOrCreateOfferwallGameId };
