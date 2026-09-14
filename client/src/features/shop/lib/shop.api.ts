import { api } from '../../../shared/auth/auth.store';
import type {
  ShopCatalogFan,
  ShopCatalogMiner,
  ShopCatalogRack,
  ShopMinersResponse,
  ShopPurchaseResponse,
} from './shop.types';

export * from './shop.types';

export function getShopMiners(params?: { page?: number; pageSize?: number }) {
  return api.get<ShopMinersResponse>('/shop/miners', { params });
}

export function postShopPurchase(body: { minerId: number; quantity: number; idempotencyKey?: string }) {
  return api.post<ShopPurchaseResponse>('/shop/purchase', body);
}

export function postShopPurchaseFan(body: { sku: string; quantity: number; idempotencyKey?: string }) {
  return api.post<ShopPurchaseResponse & { fanCredits?: number }>('/shop/purchase-fan', body);
}

export function postShopPurchaseRack(body: { sku: string; quantity: number; idempotencyKey?: string }) {
  return api.post<ShopPurchaseResponse & { rackCredits?: number }>('/shop/purchase-rack', body);
}
