/**
 * Polygon hot-wallet SIGNER — extends the read-only `polygonProvider.ts` with the ability to
 * load a signing `ethers.Wallet` for the withdrawal auto-send engine
 * (server/modules/wallet/withdrawal/withdrawal.auto-send.ts).
 *
 * SECURITY (read before touching this file):
 *  - The ONLY source of the private key is `process.env.WITHDRAWAL_PRIVATE_KEY`. There is no
 *    hardcoded key anywhere in this repo, no mnemonic fallback (unlike legacy, which also
 *    accepted `WITHDRAWAL_MNEMONIC` — deliberately not ported, to keep exactly one, explicit
 *    key source per the task's security rules).
 *  - `getWithdrawalHotWallet()` returns `null` (never throws, never fabricates a wallet) when
 *    the env var is unset/blank/invalid — callers MUST treat `null` as "auto-send disabled,
 *    safe mode".
 *  - This module never calls `sendTransaction` / `broadcastTransaction` itself — it only
 *    constructs a `Wallet` connected to the shared provider. Broadcasting (if ever enabled) is
 *    the caller's responsibility and must remain confined to withdrawal.auto-send.ts.
 */
import { ethers } from "ethers";
import { getSharedPolygonProvider } from "./polygonProvider.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("PolygonSigner");

export function isWithdrawalPrivateKeyConfigured(): boolean {
  const raw = String(process.env.WITHDRAWAL_PRIVATE_KEY || "").trim();
  return Boolean(raw) && raw !== "0x0000000000000000000000000000000000000000000000000000000000000000";
}

/** Returns a connected signing wallet, or null when unconfigured/invalid — never throws. */
export function getWithdrawalHotWallet(): ethers.Wallet | null {
  if (!isWithdrawalPrivateKeyConfigured()) return null;
  const raw = String(process.env.WITHDRAWAL_PRIVATE_KEY || "").trim();
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  try {
    return new ethers.Wallet(key, getSharedPolygonProvider());
  } catch (err: unknown) {
    log.error("Invalid WITHDRAWAL_PRIVATE_KEY — auto-send disabled", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
