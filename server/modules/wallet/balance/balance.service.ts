/** Ported from legacy walletModel.getUserBalance + wallet.controller getBalance extras. */
import * as balanceRepo from "./balance.repository.js";
import type { WalletBalanceDto } from "../wallet.types.js";
import { getPolUsdPrice } from "../../../shared/cryptoPrice/cryptoPrice.js";

/**
 * Re-exported from shared/cryptoPrice/ (single implementation with the full legacy fallback
 * chain: CoinGecko x2 -> Binance x2, shared with swap/swap.service.ts).
 */
export { getPolUsdPrice };

const BALANCE_CACHE_TTL_MS = Math.max(
  1_000,
  Number(process.env.WALLET_BALANCE_CACHE_TTL_MS ?? 10_000) || 10_000,
);
const balanceCache = new Map<number, { at: number; payload: WalletBalanceDto }>();

function emptyBalance(): WalletBalanceDto {
  return {
    balance: 0,
    blkBalance: 0,
    blkLocked: 0,
    shibBalance: 0,
    miningPayoutMode: "pol",
    blkUsdEquivalent: 0,
    lifetimeMined: 0,
    totalWithdrawn: 0,
    walletAddress: null,
    btcBalance: 0,
    ethBalance: 0,
    usdtBalance: 0,
    usdcBalance: 0,
    zerBalance: 0,
  };
}

export async function getBalanceForUser(userId: number): Promise<WalletBalanceDto | null> {
  const id = Number(userId);
  const now = Date.now();
  const hit = Number.isFinite(id) ? balanceCache.get(id) : undefined;
  if (hit && now - hit.at < BALANCE_CACHE_TTL_MS) {
    return hit.payload;
  }

  const [user, totalWithdrawn] = await Promise.all([
    balanceRepo.findUserBalanceRow(userId),
    balanceRepo.sumCompletedWithdrawals(userId),
  ]);

  if (!user) return null;
  const lifetimeMined = Number(user.lifetimeMinedPol);

  const blkAvail = Number(user.blkBalance);
  const payload: WalletBalanceDto = {
    // Client contract: POL is exposed as `balance` (legacy name), not polBalance.
    balance: Number(user.polBalance),
    blkBalance: blkAvail,
    blkLocked: Number(user.blkLocked),
    shibBalance: Number(user.shibBalance),
    miningPayoutMode: user.miningPayoutMode === "blk" ? "blk" : "pol",
    blkUsdEquivalent: blkAvail,
    lifetimeMined,
    totalWithdrawn,
    walletAddress: user.walletAddress,
    btcBalance: Number(user.btcBalance),
    ethBalance: Number(user.ethBalance),
    usdtBalance: Number(user.usdtBalance),
    usdcBalance: Number(user.usdcBalance),
    zerBalance: Number(user.zerBalance),
  };

  if (Number.isFinite(id)) {
    balanceCache.set(id, { at: now, payload });
    if (balanceCache.size > 20_000) {
      const firstKey = balanceCache.keys().next().value;
      if (firstKey != null) balanceCache.delete(firstKey);
    }
  }

  return payload;
}

export function invalidateBalanceCache(userId: number): void {
  balanceCache.delete(userId);
}

/** Used when user row is missing but caller still wants a zeroed shape. */
export function getEmptyBalancePayload(): WalletBalanceDto {
  return emptyBalance();
}
