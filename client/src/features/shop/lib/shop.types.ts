export interface ShopCatalogMiner {
  id: number;
  slotSize?: number;
  imageUrl?: string | null;
  name?: string;
  baseHashRate?: number;
  price?: number | string;
  currency?: string;
}

export interface ShopCatalogFan {
  sku: string;
  nameKey: string;
  descriptionKey: string;
  price: number;
  listPrice?: number;
  currency?: string;
  imageUrl?: string;
  creditsPerUnit?: number;
  salesAvailableAt?: string;
  isPurchaseLive?: boolean;
}

export type ShopCatalogRack = ShopCatalogFan;

export interface ShopMinersResponse {
  ok?: boolean;
  miners?: ShopCatalogMiner[];
  fans?: ShopCatalogFan[];
  racks?: ShopCatalogRack[];
  currency?: string;
  fanSalesAvailableAt?: string;
  rackSalesAvailableAt?: string;
}

export interface ShopPurchaseResponse {
  ok?: boolean;
  message?: string;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
  newBalance?: number;
  currency?: string;
  fanCredits?: number;
  rackCredits?: number;
}

export type PurchaseModalState =
  | { kind: 'miner'; item: ShopCatalogMiner }
  | { kind: 'fan'; item: ShopCatalogFan }
  | { kind: 'rack'; item: ShopCatalogRack };
