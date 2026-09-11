// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Read-only Polygon RPC provider — ported from legacy/server/services/polygonProvider.ts.
 *
 * SECURITY: this module never signs a transaction and never touches a private key. It only
 * reads transaction receipts/blocks via a public JSON-RPC endpoint. The HD deposit sweep
 * (`POLYGON_HD_MNEMONIC`, real fund movement) IS ported (docs/PROGRESSO.txt) but lives entirely
 * in the isolated `phd` microservice (server/phd-bootstrap/phdServer.ts) — this shared provider
 * is reused there too, but this file itself still never sees the mnemonic.
 */
import { ethers } from "ethers";
let _provider = null;
const DEFAULT_RPC_URL = "https://polygon-bor-rpc.publicnode.com";
const DEFAULT_TIMEOUT_MS = 4500;
export function getPolygonRpcTimeoutMs() {
    const raw = Number(process.env.POLYGON_RPC_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}
export function getSharedPolygonProvider() {
    if (!_provider) {
        const rpcUrl = process.env.POLYGON_RPC_URL || DEFAULT_RPC_URL;
        const fetchRequest = new ethers.FetchRequest(rpcUrl);
        fetchRequest.timeout = getPolygonRpcTimeoutMs();
        _provider = new ethers.JsonRpcProvider(fetchRequest, undefined, {
            staticNetwork: ethers.Network.from(137),
        });
    }
    return _provider;
}
/** Test helper — reset singleton between tests. */
export function resetSharedPolygonProviderForTests() {
    _provider = null;
}
