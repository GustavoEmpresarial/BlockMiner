/**
 * Pure (no I/O) helpers extracted from deposit-verifier.service.ts so the anti-fraud math can be
 * unit-tested directly, without a live DB or RPC connection.
 */
import { ethers, type TransactionReceipt } from "ethers";

/** Enough retries for slow RPC + N block confirmations on Polygon (~24min at 15s/attempt). */
export const DEPOSIT_VERIFY_MAX_ATTEMPTS = 96;

/** Attempts strictly greater than the max means the deposit has timed out (never credited). */
export function hasExpiredVerification(attempts: number): boolean {
  return attempts > DEPOSIT_VERIFY_MAX_ATTEMPTS;
}

/** Confirmations = 1 (the mining block itself) + however many blocks have landed since. */
export function computeConfirmationCount(latestBlockNumber: number, receiptBlockNumber: number): number {
  return latestBlockNumber - receiptBlockNumber + 1;
}

export function meetsRequiredConfirmations(latestBlockNumber: number, receiptBlockNumber: number, requiredConfs: number): boolean {
  return computeConfirmationCount(latestBlockNumber, receiptBlockNumber) >= requiredConfs;
}

/** Wei -> POL for a plain treasury transfer. Reads the on-chain value only — never a claimed amount. */
export function verifiedAmountFromTreasuryTransfer(onchainValueWei: bigint | string): number {
  return parseFloat(ethers.formatEther(onchainValueWei));
}

/** Wei -> POL for a contract `DepositReceived` event amount. Reads the on-chain event only. */
export function verifiedAmountFromContractEvent(eventAmountWei: bigint): number {
  return parseFloat(ethers.formatEther(eventAmountWei));
}

export function isMinedAndSuccessful(receipt: TransactionReceipt | null | undefined): boolean {
  return Boolean(receipt) && receipt!.status === 1;
}

export function classifyDestination(
  toAddress: string | null | undefined,
  treasuryAddressLower: string,
  contractAddressLower: string,
  hdAddressLower?: string | null,
): "treasury" | "contract" | "hd_deposit" | "unknown" {
  const toLower = (toAddress || "").toLowerCase();
  if (contractAddressLower && toLower === contractAddressLower) return "contract";
  if (treasuryAddressLower && toLower === treasuryAddressLower) return "treasury";
  if (hdAddressLower && toLower === hdAddressLower.toLowerCase()) return "hd_deposit";
  return "unknown";
}
