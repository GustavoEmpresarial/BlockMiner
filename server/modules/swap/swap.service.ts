// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Swap service — one-way convert POL/SHIB → BLK (1 BLK ≈ US$ 1). */
import prisma from "../../core/database/prisma.js";
import * as swapRepo from "./swap.repository.js";
import { getPolUsdPrice, getShibUsdPrice } from "../../shared/cryptoPrice/cryptoPrice.js";
import { isValidSwapPair } from "./swap.pairs.js";
export { getPolUsdPrice, getShibUsdPrice };
export { VALID_SWAP_PAIRS, isValidSwapPair } from "./swap.pairs.js";
export async function getBalancesForUser(userId) {
    const user = await swapRepo.findUserBalances(userId);
    const [polPrice, shibPrice] = await Promise.all([getPolUsdPrice(), getShibUsdPrice()]);
    return {
        balances: {
            POL: Number(user.polBalance || 0),
            SHIB: Number(user.shibBalance || 0),
            BLK: Number(user.blkBalance || 0),
        },
        prices: { POL: polPrice, SHIB: shibPrice, BLK: 1 },
    };
}
export async function executeSwapForUser(userId, fromAsset, toAsset, amountNum) {
    if (!isValidSwapPair(fromAsset, toAsset)) {
        throw new Error(`Swap ${fromAsset}→${toAsset} not supported`);
    }
    if (!(amountNum > 0) || !Number.isFinite(amountNum)) {
        throw new Error("Invalid amount");
    }
    const polPrice = await getPolUsdPrice();
    const shibPrice = await getShibUsdPrice();
    const safePol = polPrice > 0 ? polPrice : 0.09;
    const safeShib = shibPrice > 0 ? shibPrice : 0.0000055;
    let rate;
    let output;
    if (fromAsset === "POL" && toAsset === "BLK") {
        rate = safePol;
        output = Number((amountNum * safePol).toFixed(8));
    }
    else if (fromAsset === "SHIB" && toAsset === "BLK") {
        rate = safeShib;
        output = Number((amountNum * safeShib).toFixed(8));
    }
    else {
        throw new Error(`Swap ${fromAsset}→${toAsset} not supported`);
    }
    if (!(output > 0)) {
        throw new Error("Output amount too small");
    }
    await prisma.$transaction(async (tx) => {
        const user = await swapRepo.findUserBalancesTx(tx, userId);
        if (fromAsset === "POL") {
            if (Number(user.polBalance) < amountNum)
                throw new Error("Insufficient POL balance");
            await swapRepo.updatePolToBlkTx(tx, userId, amountNum, output);
        }
        else {
            if (Number(user.shibBalance) < amountNum)
                throw new Error("Insufficient SHIB balance");
            await swapRepo.updateShibToBlkTx(tx, userId, amountNum, output);
        }
    });
    return { rate, output };
}
