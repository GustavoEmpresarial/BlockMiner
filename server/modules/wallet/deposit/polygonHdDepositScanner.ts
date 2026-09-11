// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Polls Polygon (chain 137) for native POL transfers to custodial HD deposit addresses,
 * registers matching txs as pending_verification deposits, then the existing deposit-verifier
 * (deposit-verifier.service.ts) credits balances after confirmations — no crediting logic is
 * duplicated here. Ported from legacy/server/services/polygonHdDepositScanner.ts.
 *
 * SECURITY: read-only. Uses the Polygonscan/Etherscan V2 HTTP API only, never a private key.
 * Safe to run in the main `app` process (unlike allocation/sweep, which need the mnemonic and
 * live only in server/phd-bootstrap/phdServer.ts).
 */
import { ethers } from "ethers";
import prisma from "../../../core/database/prisma.js";
import { logger } from "../../../core/logger/index.js";
import { etherscanRateLimitWait } from "../../../shared/security/etherscanRateLimiter.js";
import { getRequiredBlockConfirmations } from "../../../shared/blockchain/polygonDepositConfig.js";
import { isPolygonHdFeatureFlagged } from "../../../shared/blockchain/polygonHd.config.js";
import { getSharedPolygonProvider } from "../../../shared/blockchain/polygonProvider.js";
import { runDepositVerifier } from "./deposit-verifier.service.js";
const log = logger.child("PolygonHdDepositScanner");
function getPolygonscanKey() {
    return (process.env.ETHERSCAN_API_KEY || process.env.POLYGONSCAN_API_KEY || "").trim();
}
function isAutoScanEnabled() {
    if (!isPolygonHdFeatureFlagged())
        return false;
    const v = (process.env.POLYGON_HD_AUTO_SCAN || "1").trim().toLowerCase();
    return v !== "0" && v !== "false" && v !== "off";
}
function scanIntervalMs() {
    const raw = parseInt(process.env.POLYGON_HD_DEPOSIT_SCAN_INTERVAL_MS || "900000", 10);
    return Number.isFinite(raw) && raw >= 60_000 ? raw : 900_000;
}
function lookbackBlocks() {
    const raw = parseInt(process.env.POLYGON_HD_SCAN_LOOKBACK_BLOCKS || "250000", 10);
    return Number.isFinite(raw) && raw >= 1000 ? raw : 250_000;
}
export async function fetchPolygonNativeTxList(address, startBlock, endBlock) {
    const apiKey = getPolygonscanKey();
    if (!apiKey)
        throw new Error("missing_polygonscan_api_key");
    await etherscanRateLimitWait();
    const url = `https://api.etherscan.io/v2/api?chainid=137&module=account&action=txlist` +
        `&address=${encodeURIComponent(address)}&startblock=${startBlock}&endblock=${endBlock}` +
        `&sort=asc&apikey=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    const data = (await resp.json().catch(() => ({})));
    if (data?.status !== "1") {
        if (data?.message === "No transactions found")
            return [];
        throw new Error(`polygonscan_txlist:${typeof data?.message === "string" ? data.message : "error"}`);
    }
    return Array.isArray(data.result) ? data.result : [];
}
export function isIncomingNativePolTx(tx, addressLower) {
    if (!tx || tx.isError === "1")
        return false;
    const to = String(tx.to || "").toLowerCase();
    if (to !== addressLower)
        return false;
    try {
        return BigInt(tx.value || "0") > 0n;
    }
    catch {
        return false;
    }
}
export async function runPolygonHdDepositScanOnce() {
    if (!isAutoScanEnabled())
        return { rows: 0, created: 0, skipped: true, reason: "feature_off" };
    if (!getPolygonscanKey())
        return { rows: 0, created: 0, skipped: true, reason: "missing_polygonscan_api_key" };
    const provider = getSharedPolygonProvider();
    const latest = await provider.getBlockNumber();
    const confs = getRequiredBlockConfirmations();
    const endBlock = Math.max(0, latest - Math.max(0, confs - 1));
    const lookback = lookbackBlocks();
    const addresses = await prisma.polygonHdAddress.findMany({
        select: { id: true, userId: true, address: true, lastIncomingScanBlock: true },
    });
    let created = 0;
    for (const row of addresses) {
        const addrLower = row.address.toLowerCase();
        const startFromCursor = row.lastIncomingScanBlock != null ? row.lastIncomingScanBlock + 1 : Math.max(0, endBlock - lookback);
        const startBlock = Math.min(startFromCursor, endBlock);
        if (startBlock > endBlock) {
            await prisma.polygonHdAddress.update({ where: { id: row.id }, data: { lastIncomingScanBlock: endBlock } });
            continue;
        }
        let txs;
        try {
            txs = await fetchPolygonNativeTxList(row.address, startBlock, endBlock);
        }
        catch (err) {
            log.warn("HD deposit scan txlist failed", {
                userId: row.userId,
                address: row.address,
                error: err instanceof Error ? err.message : String(err),
            });
            continue;
        }
        let maxSeenBlock = row.lastIncomingScanBlock ?? startBlock - 1;
        for (const tx of txs) {
            const bn = parseInt(tx.blockNumber || "", 10);
            if (Number.isFinite(bn))
                maxSeenBlock = Math.max(maxSeenBlock, bn);
            if (!isIncomingNativePolTx(tx, addrLower))
                continue;
            const hash = String(tx.hash || "").toLowerCase();
            if (!/^0x[0-9a-f]{64}$/.test(hash))
                continue;
            try {
                const inserted = await prisma.$transaction(async (ptx) => {
                    const existing = await ptx.transaction.findFirst({ where: { txHash: hash, type: "deposit" } });
                    if (existing)
                        return false;
                    let valuePol = 0;
                    try {
                        valuePol = parseFloat(ethers.formatEther(tx.value || "0"));
                    }
                    catch {
                        return false;
                    }
                    try {
                        await ptx.transaction.create({
                            data: {
                                userId: row.userId,
                                type: "deposit",
                                amount: Number.isFinite(valuePol) && valuePol > 0 ? String(valuePol) : "0",
                                txHash: hash,
                                status: "pending_verification",
                                verifyAttempts: 0,
                            },
                        });
                    }
                    catch (e) {
                        if (e?.code === "P2002")
                            return false;
                        throw e;
                    }
                    return true;
                });
                if (inserted) {
                    created += 1;
                    log.info("HD auto-deposit registered", { userId: row.userId, txHash: hash, block: tx.blockNumber });
                }
            }
            catch (err) {
                log.warn("HD auto-deposit row create failed", {
                    userId: row.userId,
                    txHash: hash,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        const nextCursor = Math.max(maxSeenBlock, endBlock);
        try {
            await prisma.polygonHdAddress.update({ where: { id: row.id }, data: { lastIncomingScanBlock: nextCursor } });
        }
        catch (err) {
            log.warn("HD scan cursor update failed", { id: row.id, error: err instanceof Error ? err.message : String(err) });
        }
    }
    if (created > 0) {
        await runDepositVerifier().catch(() => { });
    }
    return { rows: addresses.length, created, skipped: false };
}
export { scanIntervalMs as polygonHdScanIntervalMs };
