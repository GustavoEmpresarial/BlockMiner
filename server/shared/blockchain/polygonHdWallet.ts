// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/services/polygonHdWallet.ts.
 *
 * SECURITY: `derivePolygonHdAddressAtIndex` and `allocatePolygonHdAddress` (the two functions
 * that touch POLYGON_HD_MNEMONIC) are used ONLY by the isolated `phd` bootstrap
 * (server/phd-bootstrap/phdServer.ts) — never imported by the main `app` process. The main app
 * only ever calls `allocatePolygonHdAddressRemote`, which holds no key material at all, just an
 * internal HTTP call authenticated by PHD_INTERNAL_TOKEN. See docs/PROGRESSO.txt for why this
 * split exists (mnemonic must never share a process with the internet-facing API).
 */
import { HDNodeWallet, getAddress } from "ethers";
const DERIVATION_PREFIX = "m/44'/60'/0'/0";
export function derivePolygonHdAddressAtIndex(mnemonic, index) {
    if (!Number.isInteger(index) || index < 0) {
        throw new Error("Invalid derivation index");
    }
    const phrase = mnemonic.trim();
    const derivationPath = `${DERIVATION_PREFIX}/${index}`;
    // ethers v6: full path as third arg derives in one step (avoid derivePath from a non-root node).
    const wallet = HDNodeWallet.fromPhrase(phrase, undefined, derivationPath);
    return {
        address: getAddress(wallet.address),
        derivationPath,
        derivationIndex: index,
    };
}
/**
 * Allocates or returns the user's unique HD deposit row. Requires POLYGON_HD_MNEMONIC in this
 * process — only ever called from server/phd-bootstrap/phdServer.ts.
 */
export async function allocatePolygonHdAddress(prisma, mnemonic, userId) {
    return prisma.$transaction(async (ptx) => {
        const existing = await ptx.polygonHdAddress.findUnique({ where: { userId } });
        if (existing)
            return existing;
        const agg = await ptx.polygonHdAddress.aggregate({ _max: { derivationIndex: true } });
        const nextIndex = (agg._max.derivationIndex ?? -1) + 1;
        const derived = derivePolygonHdAddressAtIndex(mnemonic, nextIndex);
        try {
            return await ptx.polygonHdAddress.create({
                data: {
                    userId,
                    derivationIndex: derived.derivationIndex,
                    address: derived.address,
                    derivationPath: derived.derivationPath,
                },
            });
        }
        catch (e) {
            // Unique constraint race (two allocations for the same user landed concurrently) — the
            // other one won, just return what it created instead of erroring.
            const code = e?.code;
            if (code === "P2002") {
                const again = await ptx.polygonHdAddress.findUnique({ where: { userId } });
                if (again)
                    return again;
            }
            throw e;
        }
    });
}
/** Calls the isolated `phd` microservice (server/phd-bootstrap/phdServer.ts). No key material here. */
export async function allocatePolygonHdAddressRemote(userId) {
    const baseUrl = (process.env.PHD_SERVICE_URL || "").trim().replace(/\/$/, "");
    const token = (process.env.PHD_INTERNAL_TOKEN || "").trim();
    if (!baseUrl || !token) {
        throw new Error("PHD_SERVICE_URL and PHD_INTERNAL_TOKEN must be set for remote PHD");
    }
    const r = await fetch(`${baseUrl}/internal/hd/addresses`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
    });
    const data = (await r.json().catch(() => ({})));
    if (!r.ok || !data?.ok) {
        throw new Error(typeof data?.message === "string" ? data.message : `PHD HTTP ${r.status}`);
    }
    return {
        address: String(data.address),
        derivationIndex: Number(data.derivationIndex),
        derivationPath: String(data.derivationPath),
    };
}
