// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { getAddress } from "ethers";
import { requireSessionUser } from "../../../shared/errors/httpStatusError.js";
import { getMinDepositPol, getRequiredBlockConfirmations, } from "../../../shared/blockchain/polygonDepositConfig.js";
import { isPolygonHdDepositEnabled, isPolygonHdFeatureFlagged, listPolygonHdMissingEnvKeys, getPolygonHdMinDepositPol, } from "../../../shared/blockchain/polygonHd.config.js";
import { DEPOSIT_VERIFY_MAX_ATTEMPTS } from "../deposit/deposit-verifier.pure.js";
import * as balanceService from "./balance.service.js";
function normalizeHexAddressEnv(value) {
    const s = (value ?? "").trim().replace(/\r/g, "");
    if (!s)
        return null;
    try {
        return getAddress(s);
    }
    catch {
        return null;
    }
}
/** GET /api/wallet/balance — legacy client contract (`balance` = POL). */
export async function getBalance(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const balance = await balanceService.getBalanceForUser(user.id);
        if (!balance) {
            res.status(404).json({ ok: false, message: "User not found." });
            return;
        }
        const depositAddress = normalizeHexAddressEnv(process.env.DEPOSIT_WALLET_ADDRESS);
        const depositContractAddress = normalizeHexAddressEnv(process.env.SMART_CONTRACT_ADDRESS);
        res.json({
            ok: true,
            ...balance,
            depositAddress,
            depositContractAddress,
            minDepositPol: getMinDepositPol(),
            blockConfirmations: getRequiredBlockConfirmations(),
            depositVerifyMaxAttempts: DEPOSIT_VERIFY_MAX_ATTEMPTS,
            // Custodial HD deposit — real flags now (see docs/PROGRESSO.txt for the port + the
            // isolated `phd` microservice that holds POLYGON_HD_MNEMONIC, never this process).
            polygonHdDepositEnabled: isPolygonHdDepositEnabled(),
            polygonHdDepositFeatureVisible: isPolygonHdFeatureFlagged(),
            polygonHdDepositMissingEnvKeys: listPolygonHdMissingEnvKeys(),
            polygonHdMinDepositPol: getPolygonHdMinDepositPol(),
        });
    }
    catch {
        res.status(503).json({
            ok: false,
            code: "WALLET_BALANCE_UNAVAILABLE",
            message: "Saldo temporariamente indisponível.",
        });
    }
}
/** GET /api/wallet/me — thin wrapper kept for legacy client parity. */
export async function getWalletMe(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const balance = await balanceService.getBalanceForUser(user.id);
        res.json({ ok: true, wallet: balance ? { balance } : null });
    }
    catch {
        res.status(500).json({ ok: false, message: "Unable to load wallet." });
    }
}
/** GET /api/wallet/pol-usd */
export async function getWalletPolUsdPrice(_req, res) {
    try {
        const priceUsd = await balanceService.getPolUsdPrice();
        res.json({ ok: true, priceUsd });
    }
    catch {
        res.json({ ok: false, priceUsd: null });
    }
}
