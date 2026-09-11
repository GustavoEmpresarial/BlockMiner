// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Web3 wallet-link service — challenge/verify/unlink. Ported from legacy
 * wallet/application/wallet.service.ts (wallet-link section).
 *
 * Security: real cryptographic signature verification (`ethers.verifyMessage`),
 * a per-(user,address) anti-replay nonce persisted server-side with a hard
 * expiration, single-use challenges (marked completed + all challenges for
 * that (user,address) invalidated once consumed). We never sign anything with
 * our own key here — only verify a signature the user produced with theirs.
 */
import crypto from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import { HttpStatusError } from "../../../shared/errors/httpStatusError.js";
import { WALLET_ERROR } from "../wallet.errors.js";
import * as linkRepo from "./link.repository.js";
import { WALLET_LINK_ALLOWED_CHAIN_IDS, WALLET_LINK_CHALLENGE_TTL_MS } from "./link.types.js";
function normalizeAddressInput(address) {
    try {
        return getAddress(address.trim());
    }
    catch {
        throw new HttpStatusError(400, WALLET_ERROR.INVALID_ADDRESS, { code: WALLET_ERROR.INVALID_ADDRESS });
    }
}
function assertAllowedChainId(chainId) {
    if (!WALLET_LINK_ALLOWED_CHAIN_IDS.has(chainId)) {
        throw new HttpStatusError(400, WALLET_ERROR.INVALID_CHAIN, { code: WALLET_ERROR.INVALID_CHAIN });
    }
}
export async function getWalletMeForUser(userId) {
    const address = await linkRepo.getUserWalletAddress(userId);
    if (!address)
        return { wallet: null };
    return { wallet: { address, chainId: 137, verifiedAt: null } };
}
export async function createWalletLinkChallengeForUser(userId, rawAddress, chainId) {
    assertAllowedChainId(chainId);
    const address = normalizeAddressInput(rawAddress);
    const nonce = crypto.randomBytes(16).toString("hex");
    const issuedAt = new Date().toISOString();
    const message = [
        "BlockMiner wallet link",
        `User: ${userId}`,
        `Address: ${address}`,
        `Nonce: ${nonce}`,
        `IssuedAt: ${issuedAt}`,
    ].join("\n");
    await linkRepo.createWalletLinkChallenge(userId, address, chainId, message, nonce, Date.now() + WALLET_LINK_CHALLENGE_TTL_MS);
    return { message };
}
export async function verifyAndLinkWalletForUser(userId, rawAddress, chainId, signature) {
    assertAllowedChainId(chainId);
    const address = normalizeAddressInput(rawAddress);
    const addressLower = address.toLowerCase();
    const challenge = await linkRepo.findValidWalletLinkChallenge(userId, addressLower);
    if (!challenge) {
        throw new HttpStatusError(400, WALLET_ERROR.CHALLENGE_NOT_FOUND, { code: WALLET_ERROR.CHALLENGE_NOT_FOUND });
    }
    if (challenge.chainId !== chainId) {
        throw new HttpStatusError(400, WALLET_ERROR.CHALLENGE_NOT_FOUND, { code: WALLET_ERROR.CHALLENGE_NOT_FOUND });
    }
    let recovered;
    try {
        recovered = verifyMessage(challenge.message, signature);
    }
    catch {
        throw new HttpStatusError(401, WALLET_ERROR.INVALID_SIGNATURE, { code: WALLET_ERROR.INVALID_SIGNATURE });
    }
    if (recovered.toLowerCase() !== addressLower) {
        throw new HttpStatusError(401, WALLET_ERROR.INVALID_SIGNATURE, { code: WALLET_ERROR.INVALID_SIGNATURE });
    }
    await linkRepo.saveUserWallet(userId, address);
    // Single-use: mark this challenge consumed, then invalidate any other
    // pending challenge for the same (user, address) pair — real anti-replay.
    await linkRepo.markWalletLinkChallengeUsed(challenge.id);
    await linkRepo.invalidateWalletLinkChallenges(userId, addressLower);
    return { wallet: { address, chainId, verifiedAt: new Date().toISOString() } };
}
/** Legacy one-step verify (fixed message, no server-issued nonce) — kept for parity with older clients. */
export async function verifyLegacyWalletOwnership(userId, rawAddress, signature) {
    const address = normalizeAddressInput(rawAddress);
    const legacyMessage = `Verify wallet ownership for Block Miner: ${address}`;
    let recovered;
    try {
        recovered = verifyMessage(legacyMessage, signature);
    }
    catch {
        throw new HttpStatusError(401, WALLET_ERROR.INVALID_SIGNATURE, { code: WALLET_ERROR.INVALID_SIGNATURE });
    }
    if (recovered.toLowerCase() !== address.toLowerCase()) {
        throw new HttpStatusError(401, WALLET_ERROR.INVALID_SIGNATURE, { code: WALLET_ERROR.INVALID_SIGNATURE });
    }
    await linkRepo.saveUserWallet(userId, address);
    return { wallet: { address, chainId: 137, verifiedAt: new Date().toISOString() } };
}
export async function unlinkWalletForUser(userId) {
    await linkRepo.removeUserWallet(userId);
}
