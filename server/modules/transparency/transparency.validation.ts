/** Trimmed from legacy modules/transparency/transparency.validation.ts — only the address guard. */
import { EVM_ADDRESS_REGEX } from "../../shared/security/walletAddress.js";

export function assertValidTransparencyWalletAddress(address: string): string {
  if (!EVM_ADDRESS_REGEX.test(address)) {
    const err = new Error("Invalid wallet address.") as Error & { code?: string };
    err.code = "INVALID_ADDRESS";
    throw err;
  }
  return address;
}
