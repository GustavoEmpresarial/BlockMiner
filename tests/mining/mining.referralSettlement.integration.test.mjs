/**
 * Teste de INTEGRAÇÃO do item 92 — Postgres real. Prova o caminho mais crítico do sistema
 * (fechamento de bloco) ponta a ponta: `persistBlockRewards` credita minerador + comissão do
 * indicador (10%, POL e SHIB) no MESMO UPDATE, sem contar a comissão no lifetime do indicador,
 * e grava o ledger em referral_earnings. Guarda de regressão: se alguém remover o crédito de
 * referral do persistBlockRewards, este teste quebra.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { persistBlockRewards } = await import("../../server/modules/mining/mining.repository.ts");

const createdUserIds = [];
let blockNumber = 900_000_000 + Math.floor(Math.random() * 1_000_000);

async function makeUser({ referredBy = null } = {}) {
  const suffix = `refsettle_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Ref Settle Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.42",
      ip: "203.0.113.42",
      userAgent: "test-agent/1.0",
      referredBy,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

function rewardRow(userId, pol, shib = 0) {
  return {
    minerId: `m-${userId}`,
    userId,
    username: `u${userId}`,
    walletAddress: null,
    rigs: 1,
    baseHashRate: 100,
    workAccumulated: 100,
    sharePercentage: 50,
    rewardAmount: pol,
    balanceAfter: pol,
    lifetimeMined: pol,
    workPol: 100,
    workShib: 0,
    shareShibPercentage: 0,
    allocationPolBps: 10000,
    rewardAmountShib: shib,
  };
}

test.after(async () => {
  if (createdUserIds.length) {
    const where = { OR: [{ referrerId: { in: createdUserIds } }, { referredId: { in: createdUserIds } }] };
    await prisma.referralEarning.deleteMany({ where });
    await prisma.miningRewardsLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.blockMinerReward.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("item 92: fechamento de bloco credita minerador + comissão de 10% do indicador (POL e SHIB)", async () => {
  const referrer = await makeUser();
  const referred = await makeUser({ referredBy: referrer.id });

  const bn = blockNumber++;
  await persistBlockRewards({
    blockNumber: bn,
    blockReward: 100,
    blockRewardShib: 50,
    totalWork: 100,
    totalWorkPol: 100,
    totalWorkShib: 100,
    minerRewards: [rewardRow(referred.id, 100, 50)],
    now: Date.now(),
  });

  const refUser = await prisma.user.findUnique({
    where: { id: referrer.id },
    select: { polBalance: true, shibBalance: true, lifetimeMinedPol: true },
  });
  const minedUser = await prisma.user.findUnique({
    where: { id: referred.id },
    select: { polBalance: true, shibBalance: true, lifetimeMinedPol: true },
  });

  // Indicador: 10% de 100 POL e de 50 SHIB — e ZERO no lifetime (comissão não é mineração).
  assert.equal(Number(refUser.polBalance), 10, "indicador deve receber 10 POL de comissão");
  assert.equal(Number(refUser.shibBalance), 5, "indicador deve receber 5 SHIB de comissão");
  assert.equal(Number(refUser.lifetimeMinedPol), 0, "comissão NÃO conta no lifetime do indicador");

  // Minerador: reward cheio, com lifetime.
  assert.equal(Number(minedUser.polBalance), 100, "minerador recebe o reward cheio");
  assert.equal(Number(minedUser.lifetimeMinedPol), 100, "reward do minerador conta no lifetime");

  // Ledger gravado.
  const earnings = await prisma.referralEarning.findMany({
    where: { referrerId: referrer.id, referredId: referred.id, source: `mining_block_${bn}` },
  });
  assert.equal(earnings.length, 1, "uma linha de referral_earning por par no bloco");
  assert.equal(Number(earnings[0].amount), 10);
  assert.equal(Number(earnings[0].amountShib), 5);
});

test("item 92: minerador sem indicador é pago normal e NÃO gera linha de referral", async () => {
  const solo = await makeUser();
  const bn = blockNumber++;
  await persistBlockRewards({
    blockNumber: bn,
    blockReward: 40,
    blockRewardShib: 0,
    totalWork: 100,
    totalWorkPol: 100,
    totalWorkShib: 0,
    minerRewards: [rewardRow(solo.id, 40, 0)],
    now: Date.now(),
  });

  const u = await prisma.user.findUnique({ where: { id: solo.id }, select: { polBalance: true } });
  assert.equal(Number(u.polBalance), 40);
  const earnings = await prisma.referralEarning.count({ where: { source: `mining_block_${bn}` } });
  assert.equal(earnings, 0, "sem indicador, nenhuma linha de comissão");
});
