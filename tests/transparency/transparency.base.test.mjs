import test from "node:test";
import assert from "node:assert/strict";

const base = await import("../../client/src/features/transparency/components/transparency.base.ts");

test("toMonthly normalizes recurring periods", () => {
  assert.equal(base.toMonthly(30, "daily"), 900);
  assert.equal(base.toMonthly(120, "monthly"), 120);
  assert.equal(base.toMonthly(1200, "annual"), 100);
  assert.equal(base.toMonthly(500, "one_time"), 0);
});

test("toAnnual normalizes recurring periods", () => {
  assert.equal(base.toAnnual(10, "daily"), 3650);
  assert.equal(base.toAnnual(100, "monthly"), 1200);
  assert.equal(base.toAnnual(640, "one_time"), 640);
});

test("fmt formats USD values", () => {
  assert.equal(base.fmt(0), "$0.00");
  assert.equal(base.fmt(1234.5), "$1,234.50");
  assert.equal(base.fmt(1500, true), "$1.5k");
});

test("getInvestmentBreakdown splits liquid vs LP", () => {
  const breakdown = base.getInvestmentBreakdown({
    address: "0xabc",
    valueUsd: 1000,
    tokens: [{ symbol: "USDC", usdValue: 200 }],
    chains: [{ chainId: 137, name: "polygon", nativeBalance: 1, nativeSymbol: "POL", tokens: [], lpUsd: 300 }],
  });
  assert.equal(breakdown.liquidStableUsd, 200);
  assert.equal(breakdown.lpUsd, 300);
  assert.equal(breakdown.liquidUsd, 700);
});

test("CATEGORY_ORDER includes infrastructure first", () => {
  assert.equal(base.CATEGORY_ORDER[0], "infrastructure");
  assert.ok(base.CATEGORY_ORDER.includes("misc"));
});

test("legacy wallets are excluded from treasury KPI", () => {
  const activeDeposit = {
    address: "0x9DA76e0000000000000000000000000000000000",
    isActive: true,
    includeInTotals: true,
    valueUsd: 100,
  };
  const oldDeposit = {
    address: base.OLD_DEPOSIT_WALLET_ADDRESS,
    isActive: true,
    includeInTotals: true,
    valueUsd: 1781.74,
  };
  const oldWithdrawal = {
    address: base.OLD_WITHDRAWAL_WALLET_ADDRESS,
    isActive: false,
    includeInTotals: true,
    valueUsd: 10.72,
  };

  assert.equal(base.isLegacyWallet(oldDeposit), true);
  assert.equal(base.isLegacyWallet(oldWithdrawal), true);
  assert.equal(base.isLegacyWallet(activeDeposit), false);
  assert.equal(base.walletTreasuryUsd(oldDeposit), 0);
  assert.equal(base.walletTreasuryUsd(oldWithdrawal), 0);
  assert.equal(base.walletTreasuryUsd(activeDeposit), 100);
});
