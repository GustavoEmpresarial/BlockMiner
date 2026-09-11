import { api } from '../../../shared/auth/auth.store';

export interface ShopCatalogMiner {
  id: number;
  slotSize?: number;
  imageUrl?: string;
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

export function getShopMiners() {
  return api.get<ShopMinersResponse>('/shop/miners');
}

export interface ShopPurchaseResponse {
  ok?: boolean;
  message?: string;
  messageKey?: string;
  messageParams?: Record<string, unknown>;
}

export function postShopPurchase(body: Record<string, unknown>) {
  return api.post<ShopPurchaseResponse>('/shop/purchase', body);
}

export function postShopPurchaseFan(body: Record<string, unknown>) {
  return api.post<ShopPurchaseResponse & { fanCredits?: number }>('/shop/purchase-fan', body);
}

export function postShopPurchaseRack(body: Record<string, unknown>) {
  return api.post<ShopPurchaseResponse & { rackCredits?: number }>('/shop/purchase-rack', body);
}
