/**
 * Ported from legacy/server/services/contractDepositLog.ts. Read-only ABI log parsing — no
 * signing, no state mutation.
 */
import { ethers, type TransactionReceipt } from "ethers";
import { BLOCK_MINER_DEPOSIT_ABI } from "./blockMinerDepositAbi.js";

const iface = new ethers.Interface(BLOCK_MINER_DEPOSIT_ABI);

export type ContractDepositEvent = {
  userId: string;
  sender: string;
  amount: bigint;
};

export function extractDepositReceivedFromReceipt(
  receipt: TransactionReceipt | null | undefined,
  contractAddressLower: string,
): ContractDepositEvent | null {
  if (!receipt?.logs?.length) return null;
  const target = contractAddressLower.toLowerCase();
  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== target) continue;
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "DepositReceived") {
        return {
          userId: String(parsed.args.userId).toLowerCase(),
          sender: String(parsed.args.sender).toLowerCase(),
          amount: BigInt(parsed.args.amount.toString()),
        };
      }
    } catch {
      /* not our event */
    }
  }
  return null;
}

/**
 * Contract enforces userId == msg.sender; linked profile wallet must match both.
 */
export function contractDepositMatchesLinkedWallet(
  linkedWalletLower: string,
  userId: string,
  txFromLower: string,
): boolean {
  if (!linkedWalletLower) return false;
  const u = String(userId).toLowerCase();
  const f = String(txFromLower).toLowerCase();
  return linkedWalletLower === u && u === f;
}
