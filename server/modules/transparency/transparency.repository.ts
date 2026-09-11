import prisma from "../../core/database/prisma.js";
import type { Prisma } from "@prisma/client";

export async function listTrackedWallets(includeInactive: boolean) {
  return prisma.transparencyTrackedWallet.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function listPublicActiveWallets() {
  return prisma.transparencyTrackedWallet.findMany({
    where: { isActive: true, isPublic: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function findWalletSettings() {
  return prisma.transparencyWalletSettings.findUnique({ where: { id: 1 } });
}

export async function upsertWalletSettings(address: string | null): Promise<void> {
  await prisma.transparencyWalletSettings.upsert({ where: { id: 1 }, create: { id: 1, address }, update: { address } });
}

export async function listActiveTransparencyEntries() {
  return prisma.transparencyEntry.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listAllTransparencyEntries() {
  return prisma.transparencyEntry.findMany({
    orderBy: [{ type: "asc" }, { category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createTransparencyEntry(data: Prisma.TransparencyEntryCreateInput) {
  return prisma.transparencyEntry.create({ data });
}

export async function findTransparencyEntryById(id: number) {
  return prisma.transparencyEntry.findUnique({ where: { id } });
}

export async function updateTransparencyEntry(id: number, data: Prisma.TransparencyEntryUpdateInput) {
  return prisma.transparencyEntry.update({ where: { id }, data });
}

export async function deleteTransparencyEntry(id: number): Promise<void> {
  await prisma.transparencyEntry.delete({ where: { id } });
}

export async function createTrackedWallet(data: Prisma.TransparencyTrackedWalletCreateInput) {
  return prisma.transparencyTrackedWallet.create({ data });
}

export async function findTrackedWalletById(id: number) {
  return prisma.transparencyTrackedWallet.findUnique({ where: { id } });
}

export async function updateTrackedWallet(id: number, data: Prisma.TransparencyTrackedWalletUpdateInput) {
  return prisma.transparencyTrackedWallet.update({ where: { id }, data });
}

export async function deleteTrackedWallet(id: number): Promise<void> {
  await prisma.transparencyTrackedWallet.delete({ where: { id } });
}

export async function aggregateCompletedWithdrawals() {
  return prisma.transaction.aggregate({ where: { type: "withdrawal", status: "completed" }, _sum: { amount: true }, _count: { id: true } });
}

// ─── Multi-chain wallet snapshot (server/cron/wallet-snapshot.cron.ts) ───────

/** Public wallets eligible for on-chain snapshot fetching (manual USD override wallets are skipped). */
export async function listSnapshotEligibleWallets() {
  return prisma.transparencyTrackedWallet.findMany({
    where: { isPublic: true, manualUsdValue: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function findWalletSnapshot(walletId: number) {
  return prisma.transparencyWalletSnapshot.findUnique({ where: { walletId } });
}

export async function upsertWalletSnapshot(
  walletId: number,
  data: { totalUsd: number | null; valuePol: number | null; chains: Prisma.InputJsonValue; tokens: Prisma.InputJsonValue; nfts: Prisma.InputJsonValue; fetchedAt: Date },
) {
  return prisma.transparencyWalletSnapshot.upsert({
    where: { walletId },
    create: { walletId, ...data },
    update: data,
  });
}

/** All public wallets (active + legacy) with snapshot and active LP positions. */
export async function listPublicWalletsWithSnapshot() {
  return prisma.transparencyTrackedWallet.findMany({
    where: { isPublic: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      snapshot: true,
      liquidityPools: {
        where: { status: "active" },
        orderBy: [{ chainId: "asc" }, { updatedAt: "desc" }],
      },
    },
  });
}

export async function listActiveLiquidityPoolPositions(walletId: number) {
  return prisma.transparencyLiquidityPoolPosition.findMany({ where: { walletId, status: "active" } });
}

export async function upsertLiquidityPoolPosition(
  walletId: number,
  chainId: number,
  contractAddress: string,
  tokenId: string,
  data: Prisma.TransparencyLiquidityPoolPositionUncheckedCreateInput,
) {
  return prisma.transparencyLiquidityPoolPosition.upsert({
    where: { walletId_chainId_contractAddress_tokenId: { walletId, chainId, contractAddress, tokenId } },
    create: data,
    update: data,
  });
}

export async function deleteLiquidityPoolPositionsByIds(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await prisma.transparencyLiquidityPoolPosition.deleteMany({ where: { id: { in: ids } } });
}

// ─── External investments ("investimentos em outros sites") ─────────────────

export async function listActiveExternalInvestments() {
  return prisma.transparencyExternalInvestment.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function listAllExternalInvestments() {
  return prisma.transparencyExternalInvestment.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createExternalInvestment(data: Prisma.TransparencyExternalInvestmentCreateInput) {
  return prisma.transparencyExternalInvestment.create({ data });
}

export async function findExternalInvestmentById(id: number) {
  return prisma.transparencyExternalInvestment.findUnique({ where: { id } });
}

export async function updateExternalInvestment(id: number, data: Prisma.TransparencyExternalInvestmentUpdateInput) {
  return prisma.transparencyExternalInvestment.update({ where: { id }, data });
}

export async function deleteExternalInvestment(id: number): Promise<void> {
  await prisma.transparencyExternalInvestment.delete({ where: { id } });
}

// ─── Physical hardware assets (ASIC, etc.) ───────────────────────────────────

export async function listActiveHardwareAssets() {
  return prisma.transparencyHardwareAsset.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      profitLogs: { orderBy: { earnedAt: "desc" } },
    },
  });
}

export async function listAllHardwareAssets() {
  // Admin list is metadata-only — profit logs are fetched via dedicated endpoints.
  // Do not include profitLogs here: satoshiAmount is BigInt and breaks res.json().
  return prisma.transparencyHardwareAsset.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createHardwareAsset(data: Prisma.TransparencyHardwareAssetCreateInput) {
  return prisma.transparencyHardwareAsset.create({ data });
}

export async function findHardwareAssetById(id: number) {
  return prisma.transparencyHardwareAsset.findUnique({ where: { id } });
}

export async function updateHardwareAsset(id: number, data: Prisma.TransparencyHardwareAssetUpdateInput) {
  return prisma.transparencyHardwareAsset.update({ where: { id }, data });
}

export async function deleteHardwareAsset(id: number): Promise<void> {
  await prisma.transparencyHardwareAsset.delete({ where: { id } });
}

export async function listHardwareProfitLogs(hardwareAssetId: number) {
  return prisma.transparencyHardwareProfitLog.findMany({
    where: { hardwareAssetId },
    orderBy: { earnedAt: "desc" },
  });
}

export async function findHardwareProfitLogById(id: number) {
  return prisma.transparencyHardwareProfitLog.findUnique({ where: { id } });
}

export async function createHardwareProfitLog(data: Prisma.TransparencyHardwareProfitLogCreateInput) {
  return prisma.transparencyHardwareProfitLog.create({ data });
}

export async function updateHardwareProfitLog(id: number, data: Prisma.TransparencyHardwareProfitLogUpdateInput) {
  return prisma.transparencyHardwareProfitLog.update({ where: { id }, data });
}

export async function deleteHardwareProfitLog(id: number): Promise<void> {
  await prisma.transparencyHardwareProfitLog.delete({ where: { id } });
}
