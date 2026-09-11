/**
 * Wallet address validation — shared by withdrawal/deposit/link/transparency, which each
 * used to define their own copy of EVM_ADDRESS_REGEX inline (ported from legacy's
 * modules/wallet/infrastructure/security/wallet.security.ts, which centralized it too).
 * Protects withdrawal endpoints from malformed addresses that could permanently lose funds.
 */
import { getAddress } from "ethers";

/** 20-byte 0x-prefixed hex address. Stricter than ethers.getAddress — rejects ICAP/mixed
 * inputs at the validation boundary before they reach the checksummed path. */
export const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/** Trims a raw env var value and returns a checksummed address, or null if invalid/missing. */
export function normalizeHexAddressEnv(value: string | undefined): string | null {
  const s = (value ?? "").trim().replace(/\r/g, "");
  if (!s) return null;
  try {
    return getAddress(s);
  } catch {
    return null;
  }
}
