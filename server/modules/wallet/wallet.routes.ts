// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { requireEmailVerified } from "../../core/http/middleware/requireEmailVerified.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { validateBody } from "../../core/http/middleware/validate.js";
import * as balanceController from "./balance/balance.controller.js";
import * as depositController from "./deposit/deposit.controller.js";
import * as polygonHdController from "./deposit/polygonHd.controller.js";
import * as withdrawalController from "./withdrawal/withdrawal.controller.js";
import * as transactionController from "./transaction/transaction.controller.js";
import * as linkController from "./link/link.controller.js";
import { postDepositEstimateGasSchema, submitDepositSchema } from "./deposit/deposit.schemas.js";
import { withdrawRequestSchema, shibWithdrawRequestSchema } from "./withdrawal/withdrawal.schemas.js";
import { walletLinkChallengeBodySchema, walletLinkVerifyBodySchema, updateWalletAddressSchema, } from "./link/link.schemas.js";
import { vaultRouter } from "./vault/vault.routes.js";
export const walletRouter = express.Router();
const walletLimiter = createDistributedRateLimiter({
    windowMs: 60_000,
    max: 10,
    name: "wallet",
    keyGenerator: (req) => `ip:${req.ip}`,
    secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});
/** In-memory: wallet GETs must not pay PG advisory-lock tax per poll. */
const WALLET_READ_WINDOW_MS = Math.max(
    1_000,
    Number(process.env.WALLET_READ_RATE_WINDOW_MS ?? 60_000) || 60_000,
);
const WALLET_READ_MAX = Math.max(
    10,
    Number(process.env.WALLET_READ_RATE_MAX ?? 120) || 120,
);
const walletReadLimiterByIp = createRateLimiter({
    windowMs: WALLET_READ_WINDOW_MS,
    max: WALLET_READ_MAX,
    name: "wallet_read_ip",
    keyGenerator: (req) => `ip:${req.ip}`,
});
const walletReadLimiterByUid = createRateLimiter({
    windowMs: WALLET_READ_WINDOW_MS,
    max: WALLET_READ_MAX,
    name: "wallet_read_uid",
    keyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : `ip:${req.ip}`),
});
const walletReadLimiter = [walletReadLimiterByIp, walletReadLimiterByUid];
walletRouter.get("/me", requireAuth, ...walletReadLimiter, balanceController.getWalletMe);
walletRouter.get("/balance", requireAuth, ...walletReadLimiter, balanceController.getBalance);
walletRouter.get("/pol-usd", requireAuth, ...walletReadLimiter, balanceController.getWalletPolUsdPrice);
walletRouter.get("/transactions", requireAuth, ...walletReadLimiter, transactionController.getTransactions);
walletRouter.get("/deposits", requireAuth, ...walletReadLimiter, depositController.getDeposits);
walletRouter.get("/deposit/pending", requireAuth, ...walletReadLimiter, depositController.getPendingDeposits);
walletRouter.get("/deposit/hd-address", requireAuth, ...walletReadLimiter, polygonHdController.getPolygonHdDepositAddress);
walletRouter.post("/deposit/submit", requireAuth, walletLimiter, validateBody(submitDepositSchema), depositController.submitDeposit);
walletRouter.post("/deposit/estimate-gas", requireAuth, walletLimiter, validateBody(postDepositEstimateGasSchema), depositController.postDepositEstimateGas);
walletRouter.post("/withdraw", requireAuth, 
// item 95 Parte B: saque é a ação mais sensível do pentest — exige email confirmado.
// Usuários criados antes deste deploy foram backfillados, não são afetados.
requireEmailVerified, walletLimiter, validateBody(withdrawRequestSchema), withdrawalController.requestWithdrawal);
walletRouter.get("/withdraw-fee-info", requireAuth, ...walletReadLimiter, withdrawalController.getWithdrawFeeInfo);
walletRouter.get("/shib/withdraw-min", requireAuth, ...walletReadLimiter, withdrawalController.getShibWithdrawMin);
walletRouter.post("/shib/withdraw", requireAuth, requireEmailVerified, walletLimiter, validateBody(shibWithdrawRequestSchema), withdrawalController.requestShibWithdrawal);
// --- Web3 wallet link (12b — see docs/PROGRESSO.txt) ---
walletRouter.post("/link/challenge", requireAuth, walletLimiter, validateBody(walletLinkChallengeBodySchema), linkController.postWalletLinkChallenge);
walletRouter.post("/link/verify", requireAuth, walletLimiter, validateBody(walletLinkVerifyBodySchema), linkController.postWalletLinkVerify);
walletRouter.delete("/link", requireAuth, walletLimiter, linkController.deleteWalletLink);
walletRouter.post("/update-address", requireAuth, walletLimiter, validateBody(updateWalletAddressSchema), linkController.postUpdateAddress);
walletRouter.use("/vault", vaultRouter);
