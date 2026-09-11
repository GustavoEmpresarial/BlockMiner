// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Live on-chain wallet activity for the admin transparency panel.
 *
 * Historical tx-list aggregation in legacy (`fetchWalletNativeActivity` in
 * legacy/server/services/transparencyWalletService.ts + transparencyWallet.etherscan.ts)
 * called the Etherscan V2 API (Polygonscan) with `POLYGONSCAN_API_KEY`. That key is not
 * configured in this environment (missing from .env/.env.example) and no Etherscan/Polygonscan
 * client was ported to `current/` — only the read-only ethers.js RPC provider in
 * `server/shared/blockchain/polygonProvider.ts` (ported for the deposit verifier, see
 * docs/PROGRESSO.txt item 10b).
 *
 * Rather than fabricate tx history or fake a stub with zero attempt, this module:
 *  - makes a REAL RPC call (via the shared provider) for the wallet's current native balance
 *    and the current block number, which are honestly obtainable without an explorer API key.
 *  - honestly reports `apiKeyConfigured: false` and an explanatory `note` when
 *    POLYGONSCAN_API_KEY is absent, instead of pretending to have full tx-history/movement data.
 *  - degrades to `error: "provider_error"` (balance/blockNumber null) if the RPC call itself
 *    fails, mirroring the ip-intelligence provider_not_configured/provider_error convention
 *    (server/modules/ip-intelligence/ip-intelligence.service.ts).
 *
 * If POLYGONSCAN_API_KEY is ever configured, the historical movement/summary fields remain
 * null/zeroed here — wiring the real Etherscan V2 txlist call is out of scope for this pass
 * and should be ported as a follow-up (see docs/PROGRESSO.txt).
 */
import { ethers } from "ethers";
import { getSharedPolygonProvider } from "../../shared/blockchain/polygonProvider.js";
const ZERO_SUMMARY = {
    totalInPol: null,
    totalOutPol: null,
    totalInUsd: null,
    totalOutUsd: null,
    movementCount: 0,
};
/** True when a (non-empty) Polygonscan/Etherscan API key is configured in this environment. */
export function polygonscanApiKeyConfigured() {
    return Boolean(String(process.env.POLYGONSCAN_API_KEY || "").trim());
}
/**
 * Fetch live native-activity data for a single wallet address.
 *
 * Always attempts a real read-only RPC call (balance + block number). Never fabricates
 * transaction history: without POLYGONSCAN_API_KEY, `movements` stays empty and `summary`
 * stays zeroed/null, with `note` explaining why.
 */
export async function fetchWalletNativeActivity(address, opts = {}) {
    const provider = opts.provider ?? getSharedPolygonProvider();
    const apiKeyConfigured = polygonscanApiKeyConfigured();
    const note = apiKeyConfigured
        ? "POLYGONSCAN_API_KEY is configured but historical tx-list aggregation was not ported in this phase; only live balance is fetched via RPC."
        : "POLYGONSCAN_API_KEY is not configured — historical tx-list/movement data is unavailable. Only the current balance and block number were fetched via read-only RPC.";
    try {
        const [balanceWei, blockNumber] = await Promise.all([provider.getBalance(address), provider.getBlockNumber()]);
        return {
            address,
            apiKeyConfigured,
            balancePol: Number(ethers.formatEther(balanceWei)),
            blockNumber,
            note,
            summary: ZERO_SUMMARY,
            movements: [],
            error: null,
        };
    }
    catch {
        return {
            address,
            apiKeyConfigured,
            balancePol: null,
            blockNumber: null,
            note: `${note} (RPC call failed.)`,
            summary: ZERO_SUMMARY,
            movements: [],
            error: "provider_error",
        };
    }
}
