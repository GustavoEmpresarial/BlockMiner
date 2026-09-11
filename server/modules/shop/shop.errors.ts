/** Ported from the exact `Error.message` strings legacy/shop.service.ts throws — callers match on message. */
export const SHOP_ERROR_MESSAGE = {
  MINER_UNAVAILABLE: "Miner unavailable.",
  OUT_OF_STOCK: "Miner out of stock.",
  PURCHASE_LIMIT_REACHED: "Miner purchase limit reached.",
  INSUFFICIENT_BALANCE: "Insufficient balance.",
} as const;

export class ShopPurchaseRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopPurchaseRejectedError";
  }
}
