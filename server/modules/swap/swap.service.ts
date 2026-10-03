/** Swap service — one-way convert POL/SHIB → BLK (1 BLK ≈ US$ 1). */
import prisma from "../../core/database/prisma.js";
import * as swapRepo from "./swap.repository.js";
import { getPolUsdPrice, getShibUsdPrice } from "../../shared/cryptoPrice/cryptoPrice.js";
import { isValidSwapPair, type SwapFromAsset, type SwapToAsset } from "./swap.pairs.js";

export { getPolUsdPrice, getShibUsdPrice };
export { VALID_SWAP_PAIRS, isValidSwapPair } from "./swap.pairs.js";

/** Fallback conservative asset prices in USD if live oracle/cryptoPrice fails */
export const SWAP_FALLBACK_POL_USD = 0.09;
export const SWAP_FALLBACK_SHIB_USD = 0.0000055;

export type UserSwapBalances = {
  balances: {
    POL: number;
    SHIB: number;
    BLK: number;
  };
  prices: {
    POL: number;
    SHIB: number;
    BLK: number;
  };
};

export type ExecuteSwapResult = {
  rate: number;
  output: number;
};

export async function getBalancesForUser(userId: number): Promise<UserSwapBalances> {
  const user = await swapRepo.findUserBalances(userId);
  const [polPrice, shibPrice] = await Promise.all([getPolUsdPrice(), getShibUsdPrice()]);
  return {
    balances: {
      POL: Number(user?.polBalance || 0),
      SHIB: Number(user?.shibBalance || 0),
      BLK: Number(user?.blkBalance || 0),
    },
    prices: { POL: polPrice, SHIB: shibPrice, BLK: 1 },
  };
}

export async function executeSwapForUser(
  userId: number,
  fromAsset: string,
  toAsset: string,
  amountNum: number,
): Promise<ExecuteSwapResult> {
  if (!isValidSwapPair(fromAsset, toAsset)) {
    throw new Error(`Swap ${fromAsset}→${toAsset} not supported`);
  }
  if (!(amountNum > 0) || !Number.isFinite(amountNum)) {
    throw new Error("Invalid amount");
  }
  const polPrice = await getPolUsdPrice();
  const shibPrice = await getShibUsdPrice();
  const safePol = polPrice > 0 ? polPrice : SWAP_FALLBACK_POL_USD;
  const safeShib = shibPrice > 0 ? shibPrice : SWAP_FALLBACK_SHIB_USD;
  let rate: number;
  let output: number;

  if (fromAsset === "POL" && toAsset === "BLK") {
    rate = safePol;
    output = Number((amountNum * safePol).toFixed(8));
  } else if (fromAsset === "SHIB" && toAsset === "BLK") {
    rate = safeShib;
    output = Number((amountNum * safeShib).toFixed(8));
  } else {
    throw new Error(`Swap ${fromAsset}→${toAsset} not supported`);
  }

  if (!(output > 0)) {
    throw new Error("Output amount too small");
  }

  await prisma.$transaction(async (tx) => {
    const user = await swapRepo.findUserBalancesTx(tx, userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (fromAsset === "POL") {
      if (Number(user.polBalance) < amountNum) {
        throw new Error("Insufficient POL balance");
      }
      await swapRepo.updatePolToBlkTx(tx, userId, amountNum, output);
    } else {
      if (Number(user.shibBalance) < amountNum) {
        throw new Error("Insufficient SHIB balance");
      }
      await swapRepo.updateShibToBlkTx(tx, userId, amountNum, output);
    }
  });

  return { rate, output };
}
