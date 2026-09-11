/**
 * Real Polygon on-chain deposit verification — ported from
 * legacy/server/services/depositVerifier.ts.
 *
 * READ-ONLY blockchain access only: reads tx receipts via a public RPC
 * (shared/blockchain/polygonProvider.ts), never signs a transaction, never touches a private
 * key. Recognized destinations:
 *  - treasury (`DEPOSIT_WALLET_ADDRESS`) — plain POL transfer
 *  - deposit smart contract (`SMART_CONTRACT_ADDRESS`) — `DepositReceived` event
 *  - user's custodial HD address (`polygon_hd_addresses`) — plain POL transfer (`hd_deposit`)
 *
 * HD fund sweep (moving POL from HD → treasury with the mnemonic) lives in the isolated `phd`
 * microservice and is out of scope here.
 *
 * Anti-fraud invariant (preserved rigorously, do not weaken): the amount credited is always the
 * REAL on-chain value read from the receipt/event — never `tx.amount` (the user-declared
 * claimed amount stored by deposit.service.ts#submitDepositForVerification).
 */
import { logger } from "../../../core/logger/index.js";
import { getSharedPolygonProvider } from "../../../shared/blockchain/polygonProvider.js";
import { getMinDepositPol, getRequiredBlockConfirmations } from "../../../shared/blockchain/polygonDepositConfig.js";
import { getPolygonHdMinDepositPol } from "../../../shared/blockchain/polygonHd.config.js";
import { contractDepositMatchesLinkedWallet, extractDepositReceivedFromReceipt, } from "../../../shared/blockchain/contractDepositLog.js";
import { valueDepositAtConfirmation } from "./deposit-valuation.service.js";
import * as depositRepo from "./deposit.repository.js";
import { classifyDestination, DEPOSIT_VERIFY_MAX_ATTEMPTS, hasExpiredVerification, isMinedAndSuccessful, meetsRequiredConfirmations, verifiedAmountFromContractEvent, verifiedAmountFromTreasuryTransfer, } from "./deposit-verifier.pure.js";
const log = logger.child("DepositVerifier");
export { DEPOSIT_VERIFY_MAX_ATTEMPTS };
function errMsg(err) {
    return err instanceof Error ? err.message : String(err);
}
/**
 * Verifies a single pending deposit against the chain. Never throws — every branch either
 * bumps `verifyAttempts` (retry later) or marks the deposit `failed` (never `completed` without
 * a real, matched, sufficiently-confirmed on-chain transfer).
 */
export async function verifyOnePendingDeposit(tx) {
    const attempts = (tx.verifyAttempts ?? 0) + 1;
    const treasuryRaw = (process.env.DEPOSIT_WALLET_ADDRESS || "").trim().toLowerCase();
    const contractRaw = (process.env.SMART_CONTRACT_ADDRESS || "").trim().toLowerCase();
    if (hasExpiredVerification(attempts)) {
        await depositRepo.markDepositVerificationFailed(tx.id, attempts, { error: "verification_timeout", attempts });
        log.warn("Deposit verification timeout", { txId: tx.id, txHash: tx.txHash, userId: tx.userId });
        return;
    }
    if (!tx.txHash) {
        await depositRepo.markDepositVerificationFailed(tx.id, attempts, { error: "missing_tx_hash" });
        return;
    }
    const provider = getSharedPolygonProvider();
    const requiredConfs = getRequiredBlockConfirmations();
    try {
        const receipt = await provider.getTransactionReceipt(tx.txHash);
        // Not mined yet (or a fake/nonexistent hash) — retry later, never crash.
        if (!receipt) {
            await depositRepo.bumpDepositVerifyAttempts(tx.id, attempts);
            return;
        }
        if (!isMinedAndSuccessful(receipt)) {
            await depositRepo.markDepositVerificationFailed(tx.id, attempts, {
                error: "tx_reverted",
                block: receipt.blockNumber,
            });
            log.warn("Deposit tx reverted on-chain", { txId: tx.id, txHash: tx.txHash });
            return;
        }
        const onchainTx = await provider.getTransaction(tx.txHash);
        if (!onchainTx) {
            await depositRepo.bumpDepositVerifyAttempts(tx.id, attempts);
            return;
        }
        if (Number(onchainTx.chainId ?? 0) !== 137) {
            await depositRepo.markDepositVerificationFailed(tx.id, attempts, {
                error: "wrong_chain",
                chainId: String(onchainTx.chainId),
            });
            return;
        }
        const hdAddr = await depositRepo.findHdDepositAddressForUser(tx.userId);
        const destination = classifyDestination(onchainTx.to, treasuryRaw, contractRaw, hdAddr);
        const isContract = destination === "contract";
        const isHd = destination === "hd_deposit";
        if (destination === "unknown") {
            await depositRepo.markDepositVerificationFailed(tx.id, attempts, { error: "wrong_destination", to: onchainTx.to });
            log.warn("Deposit wrong destination", {
                txId: tx.id,
                to: onchainTx.to,
                expectedContract: contractRaw || null,
                expectedTreasury: treasuryRaw || null,
                expectedHd: hdAddr || null,
            });
            return;
        }
        let verifiedAmount = 0;
        const depositSource = isContract ? "contract" : isHd ? "hd_deposit" : "treasury";
        if (isContract) {
            const depositEvent = extractDepositReceivedFromReceipt(receipt, contractRaw);
            if (!depositEvent) {
                await depositRepo.markDepositVerificationFailed(tx.id, attempts, { error: "no_deposit_event", to: onchainTx.to });
                log.warn("Contract deposit without DepositReceived log", { txId: tx.id, txHash: tx.txHash });
                return;
            }
            if (BigInt(onchainTx.value) !== depositEvent.amount) {
                await depositRepo.markDepositVerificationFailed(tx.id, attempts, { error: "value_event_mismatch" });
                return;
            }
            const linked = (await depositRepo.findLinkedWalletAddress(tx.userId))?.toLowerCase() ?? "";
            const fromLower = (onchainTx.from || "").toLowerCase();
            if (!contractDepositMatchesLinkedWallet(linked, depositEvent.userId, fromLower)) {
                await depositRepo.markDepositVerificationFailed(tx.id, attempts, {
                    error: "wallet_mismatch",
                    expectedLinked: linked,
                    eventUser: depositEvent.userId,
                });
                log.warn("Contract deposit wallet mismatch", { txId: tx.id, userId: tx.userId });
                return;
            }
            verifiedAmount = verifiedAmountFromContractEvent(depositEvent.amount);
        }
        else {
            verifiedAmount = verifiedAmountFromTreasuryTransfer(onchainTx.value);
        }
        const latestBlock = await provider.getBlockNumber();
        if (!meetsRequiredConfirmations(latestBlock, Number(receipt.blockNumber), requiredConfs)) {
            await depositRepo.bumpDepositVerifyAttempts(tx.id, attempts);
            return;
        }
        const minPol = isHd ? getPolygonHdMinDepositPol() : getMinDepositPol();
        if (verifiedAmount < minPol) {
            await depositRepo.markDepositVerificationFailed(tx.id, attempts, {
                error: "amount_too_small",
                value: verifiedAmount,
                minPol,
            });
            return;
        }
        // Anti-double-spend: this txHash must not already be credited on another transaction row.
        const duplicate = await depositRepo.findCompletedDuplicateByHash(tx.txHash, tx.id);
        if (duplicate) {
            await depositRepo.markDepositVerificationFailed(tx.id, attempts, {
                error: "duplicate_txhash",
                existingId: duplicate.id,
            });
            log.error("Duplicate deposit blocked", { txId: tx.id, txHash: tx.txHash, existingId: duplicate.id });
            return;
        }
        // Immutable USD valuation at on-chain confirmation moment. Retry (don't fail) on price
        // resolution errors — the chain fact doesn't change, only the price lookup is transient.
        let valuation;
        try {
            valuation = await valueDepositAtConfirmation({
                polAmount: verifiedAmount,
                blockNumber: Number(receipt.blockNumber),
                source: depositSource,
            });
        }
        catch (valErr) {
            log.warn("Deposit USD valuation failed (will retry)", { txId: tx.id, attempt: attempts, error: errMsg(valErr) });
            await depositRepo.bumpDepositVerifyAttempts(tx.id, attempts);
            return;
        }
        // Credits the REAL chain value — never tx.amount (the user-declared claimed amount).
        await depositRepo.creditVerifiedDeposit({
            transactionId: tx.id,
            userId: tx.userId,
            verifiedAmountPol: verifiedAmount,
            fromAddress: onchainTx.from ?? null,
            attempts,
            blockNumber: Number(receipt.blockNumber),
            source: depositSource,
            confirmedEventAt: valuation.confirmedEventAt,
            usdRate: valuation.usdRate,
            usdValue: valuation.usdValue,
            countsForTournament: valuation.countsForTournament,
            priceSnapshotId: valuation.priceSnapshotId,
        });
        log.info("Deposit credited", {
            userId: tx.userId,
            txId: tx.id,
            txHash: tx.txHash,
            amount: verifiedAmount,
            source: depositSource,
        });
    }
    catch (err) {
        // Transient error (RPC timeout, network) — bump attempts for retry, never crash the cron.
        await depositRepo.bumpDepositVerifyAttempts(tx.id, attempts).catch(() => undefined);
        log.warn("Deposit verify error (will retry)", { txId: tx.id, attempt: attempts, error: errMsg(err) });
    }
}
// Deviation (documented): legacy's verifier also fires a best-effort in-process notification +
// Socket.IO event and syncs the live mining-engine runtime balance after crediting (both wrapped
// in try/catch, non-critical). Not ported here — `notifications/` exists in current/ but wiring
// a cron-triggered push notification + socket room emit is a separate, larger surface than "port
// the read-only chain verifier". TODO: once a wallet-facing realtime channel exists, call
// `notifications.createNotification` here after `creditVerifiedDeposit` succeeds.
/** Fetches all pending_verification deposits sequentially (anti double-credit). Never throws. */
export async function runDepositVerifier() {
    try {
        const pending = await depositRepo.listPendingVerificationDeposits(50);
        // Sequential on purpose: parallel verify of two pending rows with the same txHash
        // used to race past findCompletedDuplicateByHash and double-credit.
        for (const tx of pending) {
            await verifyOnePendingDeposit(tx);
        }
    }
    catch (err) {
        log.error("DepositVerifier run error", { error: errMsg(err) });
    }
}
