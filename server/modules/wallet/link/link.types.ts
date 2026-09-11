/** Wallet-link constants. Ported from legacy wallet/domain/wallet.types.ts. */

/** Challenge validity window — matches legacy (10 minutes). */
export const WALLET_LINK_CHALLENGE_TTL_MS = 10 * 60 * 1000;

/** `callback_queue.callbackType` used to store pending link challenges. */
export const WALLET_LINK_CALLBACK_TYPE = "WALLET_LINK_CHALLENGE";

/** Only Polygon mainnet is accepted for wallet linking. */
export const WALLET_LINK_ALLOWED_CHAIN_IDS = new Set([137]);

export type SavedWalletDto = {
  address: string;
  chainId: number;
  verifiedAt: string | null;
};
