/**
 * DB layer for the mining module. Faithful port of the relevant pieces of
 * legacy/server/models/minerProfileModel.ts and legacy/server/models/database/serverDatabaseModel.ts
 * (persistBlockRewardsWrite / applyBlockRewardsPostCommit / loadRecentBlocks), scoped to what
 * belongs to the mining domain itself.
 *
 * DEVIATIONS FROM LEGACY (documented in README.md):
 *  - Referral commission crediting: PORTADO no item 92 (era pulado — bug real: indicadores
 *    pararam de receber os 10% em 12/08 04:10, no handoff). Lógica pura em
 *    mining.referral-settlement.ts; crédito fundido no MESMO UPDATE de saldo do passo 1 +
 *    ledger em referral_earnings no fim da transação.
 *  - Ainda pulados: a tournament domain outbox row e as post-commit reward notifications.
 *    O balance credit + MiningRewardsLog + BlockDistribution/BlockMinerReward continuam
 *    fiéis ao legacy. Re-adicionar os passos de outbox/notificação quando esses módulos
 *    existirem — espelhar `persistBlockRewardsWrite`/`applyBlockRewardsPostCommit` no legacy.
 */
import { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import prisma from "../../core/database/prisma.js";
import { isDuplicateBlockError } from "./mining.config.js";
import type { PersistBlockRewardsPayload } from "./mining.types.js";
import {
  REFERRAL_MINING_COMMISSION_RATE,
  mergeSettlementBalanceDeltas,
  buildReferralEarningsRows,
} from "./mining.referral-settlement.js";
import { buildEarningsPolCreditedOutboxRow, enqueueOutboxManyTx } from "../events/index.js";

const SETTLEMENT_WRITE_CHUNK_SIZE = 500;

function chunkRows<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Sum of hashrate from every source the mining engine understands: installed rack machines
 * (permanent) + every active temporary power grant (games, YouTube, shortlinks, auto-mining
 * GPU legacy + v2). Ported for real from legacy's `getOrCreateMinerProfile`/
 * `syncUserBaseHashRate` (models/minerProfileModel.ts).
 *
 * Real bug fixed 12/08/2026 (PROGRESSO.txt item 74): this used to be a documented, deliberate
 * stub ("none of those [temp-power] modules exist in current/ yet") — true when written, but
 * every one of those modules (games, YouTube, shortlinks, auto-mining v2) was built later this
 * same session and nobody came back to extend this function per its own TODO. Every user with
 * active temporary power (which is most active users, most of the time) had their real
 * contribution to the block silently capped at just their installed machines — visible as
 * "poder total não contabiliza jogos/auto/YouTube" in production.
 */
async function computeBaseHashRate(userId: number): Promise<number> {
  const now = new Date();
  const [activeMiners, gamePowers, ytPowers, shortlinkPowers, gpuPowers, v2Grants] = await Promise.all([
    prisma.userMiner.findMany({ where: { userId, isActive: true }, select: { hashRate: true } }),
    prisma.userPowerGame.findMany({ where: { userId, expiresAt: { gt: now } }, select: { hashRate: true } }),
    prisma.youtubeWatchPower.findMany({ where: { userId, expiresAt: { gt: now } }, select: { hashRate: true } }),
    prisma.shortlinkPower.findMany({ where: { userId, expiresAt: { gt: now } }, select: { hashRate: true } }),
    prisma.autoMiningGpu.findMany({ where: { userId, isClaimed: true, expiresAt: { gt: now } }, select: { gpuHashRate: true } }),
    prisma.autoMiningV2PowerGrant.findMany({ where: { userId, expiresAt: { gt: now } }, select: { hashRate: true } }),
  ]);

  const machineHashRate = activeMiners.reduce((sum, m) => sum + (m.hashRate || 0), 0);
  const gameHashRate = gamePowers.reduce((sum, g) => sum + (g.hashRate || 0), 0);
  const ytHashRate = ytPowers.reduce((sum, y) => sum + (y.hashRate || 0), 0);
  const shortlinkHashRate = shortlinkPowers.reduce((sum, p) => sum + (p.hashRate || 0), 0);
  const legacyGpuHashRate = gpuPowers.reduce((sum, p) => sum + (p.gpuHashRate || 0), 0);
  const v2GpuHashRate = v2Grants.reduce((sum, g) => sum + (Number(g.hashRate) || 0), 0);

  return machineHashRate + gameHashRate + ytHashRate + shortlinkHashRate + legacyGpuHashRate + v2GpuHashRate;
}

export type MinerProfileRow = {
  id: number;
  username: string | null;
  walletAddress: string | null;
  balance: number;
  shib_balance: number;
  mining_payout_mode: string;
  mining_allocation_pol_bps: number;
  refCode: string | null;
  referralCount: number;
  rigs: number;
  base_hash_rate: number;
  lifetime_mined: number;
};

/** Loads (and lazily backfills `refCode`) the profile shape the engine's `createOrGetMiner` expects. */
export async function getOrCreateMinerProfile(userId: number): Promise<MinerProfileRow> {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      walletAddress: true,
      polBalance: true,
      shibBalance: true,
      miningPayoutMode: true,
      miningAllocationPolBps: true,
      refCode: true,
      _count: { select: { referrals: true } },
    },
  });

  if (!user) throw new Error("User not found");

  if (!user.refCode) {
    const newRefCode = crypto.randomBytes(5).toString("hex");
    user = await prisma.user.update({
      where: { id: userId },
      data: { refCode: newRefCode },
      select: {
        id: true,
        username: true,
        walletAddress: true,
        polBalance: true,
        shibBalance: true,
        miningPayoutMode: true,
        miningAllocationPolBps: true,
        refCode: true,
        _count: { select: { referrals: true } },
      },
    });
  }

  const [activeMiners, baseHashRate] = await Promise.all([
    prisma.userMiner.findMany({ where: { userId, isActive: true }, select: { hashRate: true } }),
    computeBaseHashRate(userId),
  ]);

  return {
    id: user.id,
    username: user.username,
    walletAddress: user.walletAddress ?? null,
    balance: Number(user.polBalance || 0),
    shib_balance: Number(user.shibBalance || 0),
    mining_payout_mode: user.miningPayoutMode === "blk" ? "blk" : "pol",
    mining_allocation_pol_bps: Number(user.miningAllocationPolBps ?? 10000),
    refCode: user.refCode,
    referralCount: user._count.referrals,
    rigs: activeMiners.length,
    base_hash_rate: baseHashRate,
    lifetime_mined: 0, // Not tracked as a User column; derivable from mining_rewards_log if ever needed.
  };
}

export async function syncUserBaseHashRate(userId: number): Promise<number> {
  return computeBaseHashRate(userId);
}

export async function updateUserMiningAllocation(userId: number, polBps: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { miningAllocationPolBps: polBps },
  });
}

export async function updateUserMiningPayoutMode(userId: number, mode: "pol" | "blk"): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { miningPayoutMode: mode },
  });
}

/**
 * Serialised, delta-only balance persist for one miner (the engine's live `polBalance`). Ported
 * from legacy `persistMinerProfile`: row-locks the user, recomputes the delta inside the
 * transaction so concurrent persists can't double-apply the same in-memory delta.
 */
export async function persistMinerBalanceDelta(
  userId: number,
  balance: number,
  lastPersistedBalance: number,
): Promise<number> {
  const pendingDelta = balance - lastPersistedBalance;
  if (Math.abs(pendingDelta) < 0.0000001) return lastPersistedBalance;

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const delta = balance - lastPersistedBalance;
      if (Math.abs(delta) < 0.0000001) return lastPersistedBalance;
      await tx.user.update({
        where: { id: userId },
        data: {
          polBalance: delta > 0 ? { increment: delta } : { decrement: -delta },
        },
      });
      return balance;
    },
    { maxWait: 5_000, timeout: 10_000 },
  );
}

export type BlockRewardsWriteResult = { blockWasAlreadyPersisted: boolean };

/**
 * The DB write half of a block settlement: one bulk balance UPDATE, chunked MiningRewardsLog
 * inserts, and the BlockDistribution + BlockMinerReward rows. Ported from legacy
 * `persistBlockRewardsWrite`, scoped to what mining itself owns (see file-level deviation note).
 */
export async function persistBlockRewards(payload: PersistBlockRewardsPayload): Promise<BlockRewardsWriteResult> {
  const { blockNumber, blockReward, blockRewardShib = 0, totalWork, totalWorkShib = 0, minerRewards, now } = payload;
  const timestamp = new Date(now);

  // Deterministic userId order: settlements are serialised by the engine, but other financial
  // transactions may still deadlock with this one; the engine retries aborted transactions
  // instead of treating a deadlock as a paid block.
  const sortedRewards = [...minerRewards].sort((a, b) => a.userId - b.userId);

  // item 92: pré-busca de quem indicou cada minerador — UMA query, fora da transação, nunca
  // N+1 dentro dela (mesma disciplina do legacy). `referredBy` é coluna direta no User.
  const minerIds = sortedRewards.map((r) => r.userId);
  const referrerRows =
    minerIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: minerIds } }, select: { id: true, referredBy: true } })
      : [];
  const referrerByMinerId = new Map<number, number | null>();
  for (const row of referrerRows) referrerByMinerId.set(row.id, row.referredBy ?? null);

  // Funde reward do minerador + comissão do indicador (10%) num só delta por usuário, pra
  // creditar TUDO num único UPDATE (referral incluído) — não um segundo UPDATE que reintroduz
  // o deadlock de lock-upgrade. `lifetimeMinedDelta` separa: minerador conta no lifetime, a
  // comissão do indicador não.
  const balanceDeltas = mergeSettlementBalanceDeltas(sortedRewards, referrerByMinerId, REFERRAL_MINING_COMMISSION_RATE);
  const balanceRows = Array.from(balanceDeltas.entries())
    .sort((a, b) => a[0] - b[0]) // ordem determinística de userId — locks tomados monotonicamente.
    .map(
      ([userId, d]) =>
        Prisma.sql`(${userId}::int, ${d.polDelta}::double precision, ${d.shibDelta}::double precision, ${d.lifetimeMinedDelta}::double precision)`,
    );

  const referralEarningsRows = buildReferralEarningsRows(
    sortedRewards,
    referrerByMinerId,
    blockNumber,
    timestamp,
    REFERRAL_MINING_COMMISSION_RATE,
  ).sort((a, b) => a.referrerId - b.referrerId || a.referredId - b.referredId);

  // Envelopes are pure CPU work — built before the transaction opens so the tx window
  // only ever covers real DB writes.
  const outboxRows = [
    ...sortedRewards.map((r) =>
      buildEarningsPolCreditedOutboxRow({
        userId: r.userId,
        source: "mining",
        amountPol: Number(r.rewardAmount),
        occurredAt: timestamp,
        eventId: `mining:${blockNumber}:${r.userId}`,
        ref: `block:${blockNumber}`,
      }),
    ),
    ...referralEarningsRows.map((row) =>
      buildEarningsPolCreditedOutboxRow({
        userId: row.referrerId,
        source: "referrals",
        amountPol: Number(row.amount),
        occurredAt: timestamp,
        eventId: `referral:${blockNumber}:${row.referrerId}:${row.referredId}`,
        ref: `block:${blockNumber}`,
      }),
    ),
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  let blockWasAlreadyPersisted = false;
  try {
    await prisma.$transaction(async (tx) => {
      // 1) Credit every balance (mineradores + comissões de referral) in ONE statement, as the
      // transaction's FIRST write — a single, deterministic, sub-second operation that takes
      // every row lock up-front so no later statement has to upgrade one (deadlock partner).
      // `lifetime_mined_pol` usa a coluna própria do delta (0 pros indicadores), não `v.pol`.
      if (balanceRows.length > 0) {
        await tx.$executeRaw`
          UPDATE users AS u
             SET pol_balance        = u.pol_balance        + v.pol,
                 shib_balance       = u.shib_balance       + v.shib,
                 lifetime_mined_pol = u.lifetime_mined_pol + v.lifetime
            FROM (VALUES ${Prisma.join(balanceRows)}) AS v(id, pol, shib, lifetime)
           WHERE u.id = v.id
        `;
      }

      // 2) Bulk-insert the per-miner reward log rows (POL + SHIB), chunked so a single huge
      // createMany does not serialise (and block the loop) all at once.
      for (const chunk of chunkRows(sortedRewards, SETTLEMENT_WRITE_CHUNK_SIZE)) {
        await tx.miningRewardsLog.createMany({
          data: chunk.map((r) => ({
            userId: r.userId,
            blockNumber,
            workAccumulated: r.workAccumulated,
            totalNetworkWork: totalWork,
            sharePercentage: r.sharePercentage,
            rewardAmount: r.rewardAmount,
            balanceAfterReward: r.balanceAfter,
            rewardAmountShib: r.rewardAmountShib ?? 0,
            shareShibPercentage: r.shareShibPercentage ?? 0,
            workPol: r.workPol ?? r.workAccumulated,
            workShib: r.workShib ?? 0,
            createdAt: timestamp,
          })),
        });
      }

      // 3) Block distribution + per-block miner reward rows (POL + SHIB), via explicit
      // createMany rather than nested `create` (which would be one INSERT per row).
      const distribution = await tx.blockDistribution.create({
        data: {
          blockNumber,
          reward: blockReward,
          rewardShib: blockRewardShib,
          minerCount: sortedRewards.length,
          totalWork,
          totalWorkShib,
          createdAt: timestamp,
        },
        select: { id: true },
      });

      for (const chunk of chunkRows(sortedRewards, SETTLEMENT_WRITE_CHUNK_SIZE)) {
        await tx.blockMinerReward.createMany({
          data: chunk.map((r) => ({
            blockId: distribution.id,
            userId: r.userId,
            work: r.workAccumulated,
            percentage: r.sharePercentage,
            rewardAmount: r.rewardAmount,
            rewardAmountShib: r.rewardAmountShib ?? 0,
            workPol: r.workPol ?? r.workAccumulated,
            workShib: r.workShib ?? 0,
            createdAt: timestamp,
          })),
        });
      }

      // item 92: ledger de comissão de referral (histórico/stats). O CRÉDITO em si já foi no
      // UPDATE de saldo do passo 1 — isto é só o registro. Vem por último (rows já ordenadas
      // por referrerId) pra manter os locks de FK monotônicos, mesma disciplina dos inserts
      // acima. Sem stats, o "Referral" da tela de ganhos ficaria zerado mesmo com o saldo pago.
      if (referralEarningsRows.length > 0) {
        for (const chunk of chunkRows(referralEarningsRows, SETTLEMENT_WRITE_CHUNK_SIZE)) {
          await tx.referralEarning.createMany({ data: chunk });
        }
      }

      // Kafka outbox: mining + referral POL credits (stats materializer). Bulk-inserted,
      // chunked like every other write above — one `create()` per miner used to add
      // hundreds of round-trips here and was what pushed this transaction past its 15s
      // budget (P2028 "expired transaction", 15/09/2026 block 24628 retried 12x).
      await enqueueOutboxManyTx(tx, outboxRows, SETTLEMENT_WRITE_CHUNK_SIZE);
    });
  } catch (error: unknown) {
    if (!isDuplicateBlockError(error)) throw error;
    blockWasAlreadyPersisted = true;
  }

  return { blockWasAlreadyPersisted };
}

export async function loadRecentBlocks(limit = 12) {
  const blocks = await prisma.blockDistribution.findMany({
    orderBy: { blockNumber: "desc" },
    take: limit,
    include: {
      minerRewards: { select: { userId: true, rewardAmount: true, rewardAmountShib: true } },
    },
  });

  return blocks.map((b) => {
    const userRewards: Record<number, number> = {};
    const userRewardsShib: Record<number, number> = {};
    for (const r of b.minerRewards) {
      userRewards[r.userId] = r.rewardAmount;
      userRewardsShib[r.userId] = Number(r.rewardAmountShib || 0);
    }
    return {
      blockNumber: b.blockNumber,
      reward: b.reward,
      rewardShib: Number(b.rewardShib || 0),
      minerCount: b.minerCount,
      timestamp: b.createdAt.getTime(),
      userRewards,
      userRewardsShib,
    };
  });
}

export async function loadMaxBlockNumber(): Promise<number> {
  const [maxDist, maxLog] = await Promise.all([
    prisma.blockDistribution.aggregate({ _max: { blockNumber: true } }),
    prisma.miningRewardsLog.aggregate({ _max: { blockNumber: true } }),
  ]);
  return Math.max(maxDist._max.blockNumber || 0, maxLog._max.blockNumber || 0);
}
