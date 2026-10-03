import test from "node:test";
import assert from "node:assert/strict";

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const swapService = await import("../../server/modules/swap/swap.service.ts");
const balanceService = await import("../../server/modules/wallet/balance/balance.service.ts");
const authUser = await import("../../server/shared/security/authUser.ts");
const swapController = await import("../../server/modules/swap/swap.controller.ts");

const createdUserIds = [];

async function makeUser(overrides = {}) {
  const suffix = `swaptest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Swap Test User",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      polBalance: 10,
      shibBalance: 1000000,
      blkBalance: 0,
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.transaction.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

test("REGRESSÃO BUG: swap POL->BLK deve refletir a redução do saldo imediatamente no getBalanceForUser (sem saldo stale)", async () => {
  const user = await makeUser({ polBalance: 10, blkBalance: 0 });

  // 1. O usuário acessa a carteira / painel -> popula balanceCache
  const initialBalance = await balanceService.getBalanceForUser(user.id);
  assert.equal(initialBalance.balance, 10, "saldo inicial deve ser 10 POL");
  assert.equal(initialBalance.blkBalance, 0, "saldo inicial deve ser 0 BLK");

  // Popula também authUserCache
  const initialAuth = await authUser.getAuthUserById(user.id);
  assert.equal(Number(initialAuth.polBalance), 10);

  // 2. O usuário executa swap de 4 POL para BLK
  const swapResult = await swapService.executeSwapForUser(user.id, "POL", "BLK", 4);
  assert.ok(swapResult.output > 0, "deve gerar saída positiva em BLK");
  assert.equal(swapResult.balances.POL, 6, "retorno do swap deve indicar 6 POL");

  // 3. Imediatamente após o swap, o frontend chama onRefresh() -> getBalanceForUser
  const refreshedBalance = await balanceService.getBalanceForUser(user.id);

  assert.equal(
    refreshedBalance.balance,
    6,
    `O saldo em POL deve diminuir de 10 para 6 imediatamente (observado: ${refreshedBalance.balance})`
  );
  assert.equal(
    refreshedBalance.blkBalance,
    swapResult.output,
    `O saldo em BLK deve ser ${swapResult.output} imediatamente (observado: ${refreshedBalance.blkBalance})`
  );

  // 4. authUserCache também deve estar invalidado
  const refreshedAuth = await authUser.getAuthUserById(user.id);
  assert.equal(Number(refreshedAuth.polBalance), 6, "authUserCache deve refletir 6 POL");
});

test("REGRESSÃO: swap SHIB->BLK deve debitar shibBalance e creditar blkBalance com cache invalidado", async () => {
  const user = await makeUser({ shibBalance: 500000, blkBalance: 1 });

  // Popula cache
  const initial = await balanceService.getBalanceForUser(user.id);
  assert.equal(initial.shibBalance, 500000);
  assert.equal(initial.blkBalance, 1);

  const swapResult = await swapService.executeSwapForUser(user.id, "SHIB", "BLK", 200000);
  assert.ok(swapResult.output > 0);
  assert.equal(swapResult.balances.SHIB, 300000);

  const fresh = await balanceService.getBalanceForUser(user.id);
  assert.equal(fresh.shibBalance, 300000, "SHIB deve diminuir para 300.000");
  assert.equal(fresh.blkBalance, Number((1 + swapResult.output).toFixed(8)), "BLK deve ser incrementado");
});

test("INTEGRIDADE DO LEDGER: swap gera registro na tabela transactions", async () => {
  const user = await makeUser({ polBalance: 15, blkBalance: 0 });

  const swapResult = await swapService.executeSwapForUser(user.id, "POL", "BLK", 5);

  const txRow = await prisma.transaction.findFirst({
    where: { userId: user.id, type: "swap" },
    orderBy: { createdAt: "desc" },
  });

  assert.ok(txRow, "deve existir linha em transactions com type='swap'");
  assert.equal(Number(txRow.amount), 5, "quantia debitada deve ser 5 POL");
  assert.equal(txRow.status, "completed", "status deve ser completed");
  assert.equal(Number(txRow.usdRateAtConfirmation), swapResult.rate);
  assert.equal(Number(txRow.usdValueAtConfirmation), swapResult.output);
});

test("INTEGRIDADE TRANSACIONAL: falha por saldo insuficiente de POL não altera banco nem gera transação", async () => {
  const user = await makeUser({ polBalance: 2, blkBalance: 0 });

  await assert.rejects(
    async () => {
      await swapService.executeSwapForUser(user.id, "POL", "BLK", 5);
    },
    { message: "Insufficient POL balance" }
  );

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { polBalance: true, blkBalance: true },
  });
  assert.equal(Number(dbUser.polBalance), 2, "saldo não deve ser alterado");
  assert.equal(Number(dbUser.blkBalance), 0, "blk não deve ser alterado");

  const txCount = await prisma.transaction.count({
    where: { userId: user.id, type: "swap" },
  });
  assert.equal(txCount, 0, "nenhuma transação deve ter sido criada");
});

test("CONCORRÊNCIA E PREVENÇÃO DE DOUBLE SPEND: duas requisições paralelas não podem estourar saldo de POL", async () => {
  // Usuário possui 10 POL
  const user = await makeUser({ polBalance: 10, blkBalance: 0 });

  // Disparamos duas operações simultâneas de swap de 7 POL cada (total 14 POL > 10 POL)
  const results = await Promise.allSettled([
    swapService.executeSwapForUser(user.id, "POL", "BLK", 7),
    swapService.executeSwapForUser(user.id, "POL", "BLK", 7),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert.equal(fulfilled.length, 1, "exatamente UMA transação deve ter sucesso");
  assert.equal(rejected.length, 1, "exatamente UMA transação deve ser rejeitada por saldo insuficiente");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { polBalance: true, blkBalance: true },
  });
  assert.equal(Number(dbUser.polBalance), 3, "saldo deve ser exatamente 10 - 7 = 3 POL, NUNCA negativo");
  assert.ok(Number(dbUser.polBalance) >= 0, "invariante de saldo não negativo mantida sob concorrência");
});

test("REJEIÇÃO DE ENTRADAS INVÁLIDAS: pares não permitidos e quantias inválidas", async () => {
  const user = await makeUser({ polBalance: 10 });

  // Pares inválidos
  await assert.rejects(
    async () => {
      await swapService.executeSwapForUser(user.id, "BLK", "POL", 1);
    },
    { message: /Swap BLK→POL not supported/ }
  );

  await assert.rejects(
    async () => {
      await swapService.executeSwapForUser(user.id, "POL", "USDC", 1);
    },
    { message: /Swap POL→USDC not supported/ }
  );

  // Quantias <= 0
  await assert.rejects(
    async () => {
      await swapService.executeSwapForUser(user.id, "POL", "BLK", 0);
    },
    { message: "Invalid amount" }
  );

  await assert.rejects(
    async () => {
      await swapService.executeSwapForUser(user.id, "POL", "BLK", -5);
    },
    { message: "Invalid amount" }
  );
});

test("CONTROLLER executeSwap: contrato de resposta HTTP e códigos de erro estáveis", async () => {
  const user = await makeUser({ polBalance: 10, blkBalance: 0 });

  let resStatus = 200;
  let resJsonData = null;
  const mockRes = {
    status(code) {
      resStatus = code;
      return this;
    },
    json(data) {
      resJsonData = data;
      return this;
    },
  };

  // 1. Sucesso
  const reqSuccess = {
    user: { id: user.id, email: user.email },
    body: { fromAsset: "POL", toAsset: "BLK", amount: 3 },
  };
  await swapController.executeSwap(reqSuccess, mockRes);

  assert.equal(resStatus, 200);
  assert.equal(resJsonData.ok, true);
  assert.ok(typeof resJsonData.rate === "number");
  assert.ok(typeof resJsonData.output === "number");
  assert.deepEqual(resJsonData.balances, {
    POL: 7,
    SHIB: 1000000,
    BLK: resJsonData.output,
  });

  // 2. Erro de par inválido
  const reqBadPair = {
    user: { id: user.id, email: user.email },
    body: { fromAsset: "BLK", toAsset: "POL", amount: 1 },
  };
  await swapController.executeSwap(reqBadPair, mockRes);
  assert.equal(resStatus, 400);
  assert.equal(resJsonData.ok, false);
  assert.equal(resJsonData.code, "invalid_pair");

  // 3. Erro de montante inválido
  const reqBadAmount = {
    user: { id: user.id, email: user.email },
    body: { fromAsset: "POL", toAsset: "BLK", amount: -1 },
  };
  await swapController.executeSwap(reqBadAmount, mockRes);
  assert.equal(resStatus, 400);
  assert.equal(resJsonData.ok, false);
  assert.equal(resJsonData.code, "SWAP_INVALID_AMOUNT");

  // 4. Erro de saldo insuficiente
  const reqOverdraft = {
    user: { id: user.id, email: user.email },
    body: { fromAsset: "POL", toAsset: "BLK", amount: 999 },
  };
  await swapController.executeSwap(reqOverdraft, mockRes);
  assert.equal(resStatus, 400);
  assert.equal(resJsonData.ok, false);
  assert.equal(resJsonData.code, "SWAP_INSUFFICIENT_BALANCE");
});

test("SWAP SERVICE & CONTROLLER getBalances: consulta e expõe saldos e preços com sucesso", async () => {
  const user = await makeUser({ polBalance: 12.34, shibBalance: 88888, blkBalance: 5.5 });

  // 1. Serviço getBalancesForUser
  const data = await swapService.getBalancesForUser(user.id);
  assert.equal(data.balances.POL, 12.34);
  assert.equal(data.balances.SHIB, 88888);
  assert.equal(data.balances.BLK, 5.5);
  assert.ok(data.prices.POL > 0);
  assert.ok(data.prices.SHIB > 0);
  assert.equal(data.prices.BLK, 1);

  // 2. Controller getBalances
  let resStatus = 200;
  let resJsonData = null;
  const mockRes = {
    status(code) {
      resStatus = code;
      return this;
    },
    json(data) {
      resJsonData = data;
      return this;
    },
  };
  const mockReq = {
    user: { id: user.id, email: user.email },
  };
  await swapController.getBalances(mockReq, mockRes);
  assert.equal(resStatus, 200);
  assert.equal(resJsonData.ok, true);
  assert.equal(resJsonData.balances.POL, 12.34);
  assert.equal(resJsonData.balances.SHIB, 88888);
  assert.equal(resJsonData.balances.BLK, 5.5);
  assert.ok(resJsonData.prices.POL > 0);
});

