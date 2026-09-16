// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logger } from "../../../core/logger/index.js";
import { readErrorMessage, readHttpStatus, requireSessionUser } from "../../../shared/errors/httpStatusError.js";
import { WALLET_ERROR } from "../wallet.errors.js";
import * as linkService from "./link.service.js";
export async function postWalletLinkChallenge(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const { address, chainId } = req.body;
        const { message } = await linkService.createWalletLinkChallengeForUser(user.id, address, chainId);
        res.json({ ok: true, message });
    }
    catch (error) {
        const msg = readErrorMessage(error);
        const http = readHttpStatus(error);
        if (msg === WALLET_ERROR.INVALID_ADDRESS || http === 400) {
            res.status(400).json({ ok: false, message: "Invalid wallet address." });
            return;
        }
        if (msg === WALLET_ERROR.INVALID_CHAIN) {
            res.status(400).json({ ok: false, message: "Unsupported network." });
            return;
        }
        logger.error("postWalletLinkChallenge error", { error: msg });
        res.status(500).json({ ok: false, message: "Unable to start wallet link." });
    }
}
export async function postWalletLinkVerify(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const { address, chainId, signature } = req.body;
        const { wallet } = await linkService.verifyAndLinkWalletForUser(user.id, address, chainId, signature);
        logger.info("wallet.link.verified", { userId: user.id, address: wallet.address });
        res.json({ ok: true, wallet, message: "Wallet verified and linked successfully." });
    }
    catch (error) {
        const msg = readErrorMessage(error);
        const http = readHttpStatus(error);
        if (msg === WALLET_ERROR.INVALID_SIGNATURE || http === 401) {
            res.status(401).json({ ok: false, message: "Invalid wallet signature. Ownership not verified." });
            return;
        }
        if (msg === WALLET_ERROR.CHALLENGE_NOT_FOUND || msg === WALLET_ERROR.CHALLENGE_EXPIRED) {
            res.status(400).json({ ok: false, message: "Wallet link challenge expired. Request a new one." });
            return;
        }
        if (msg === WALLET_ERROR.ALREADY_LINKED || http === 409) {
            res.status(409).json({
                ok: false,
                code: WALLET_ERROR.ALREADY_LINKED,
                message: "Esta carteira já está vinculada a outra conta.",
            });
            return;
        }
        if (msg === WALLET_ERROR.INVALID_ADDRESS || http === 400) {
            res.status(400).json({ ok: false, message: "Invalid wallet address." });
            return;
        }
        logger.error("postWalletLinkVerify error", { error: msg });
        res.status(500).json({ ok: false, message: "Unable to verify wallet address." });
    }
}
export async function deleteWalletLink(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        await linkService.unlinkWalletForUser(user.id);
        res.json({ ok: true, message: "Wallet unlinked." });
    }
    catch (error) {
        logger.error("deleteWalletLink error", { error: readErrorMessage(error) });
        res.status(500).json({ ok: false, message: "Unable to unlink wallet." });
    }
}
/** Legacy shim — prefer POST /wallet/link/verify with a server-issued challenge. */
export async function postUpdateAddress(req, res) {
    const user = requireSessionUser(req, res);
    if (!user)
        return;
    try {
        const { walletAddress, signature } = req.body;
        const { wallet } = await linkService.verifyLegacyWalletOwnership(user.id, walletAddress, signature);
        logger.info("wallet.link.verified.legacy", { userId: user.id, address: wallet.address });
        res.json({ ok: true, message: "Wallet verified and linked successfully." });
    }
    catch (error) {
        const msg = readErrorMessage(error);
        const http = readHttpStatus(error);
        if (msg === WALLET_ERROR.INVALID_SIGNATURE || http === 401) {
            res.status(401).json({ ok: false, message: "Invalid wallet signature. Ownership not verified." });
            return;
        }
        if (msg === WALLET_ERROR.ALREADY_LINKED || http === 409) {
            res.status(409).json({
                ok: false,
                code: WALLET_ERROR.ALREADY_LINKED,
                message: "Esta carteira já está vinculada a outra conta.",
            });
            return;
        }
        logger.error("postUpdateAddress error", { error: msg });
        res.status(500).json({ ok: false, message: "Unable to verify wallet address." });
    }
}
