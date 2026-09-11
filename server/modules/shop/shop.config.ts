/**
 * Shop catalog currency. Miner.price is denominated in this unit.
 * Rooms already charge BLK; shop matches that wallet.
 */
export const SHOP_CURRENCY = "BLK" as const;

export type ShopCurrency = typeof SHOP_CURRENCY;

export const SHOP_BALANCE_FIELD = "blkBalance" as const;
