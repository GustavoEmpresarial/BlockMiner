/** Known deprecated wallets — always shown in legacy section, never in treasury KPI. */
export const OLD_DEPOSIT_WALLET_ADDRESS = "0x1CA03755C5132e238aE4E0f50d4929EA0D58b897";
export const OLD_WITHDRAWAL_WALLET_ADDRESS = "0x404CBeC8eC6F59e28C5F3D9e5b6080DA344792E7";

const LEGACY_WALLET_ADDRESSES = new Set([
  OLD_DEPOSIT_WALLET_ADDRESS.toLowerCase(),
  OLD_WITHDRAWAL_WALLET_ADDRESS.toLowerCase(),
]);

export function isLegacyWalletAddress(address: string): boolean {
  return LEGACY_WALLET_ADDRESSES.has(String(address ?? "").toLowerCase());
}

export function normalizeLegacyWalletFlags(wallet: {
  address: string;
  isActive: boolean;
  includeInTotals: boolean;
}): { isActive: boolean; includeInTotals: boolean } {
  const legacy = wallet.isActive === false || isLegacyWalletAddress(wallet.address);
  if (!legacy) {
    return { isActive: wallet.isActive, includeInTotals: wallet.includeInTotals };
  }
  return { isActive: false, includeInTotals: false };
}
