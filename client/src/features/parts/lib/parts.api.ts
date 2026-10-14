import { api } from '../../../shared/auth/auth.store';
import type { MergeMachineSource, MergePaymentAsset, PartsMergeResponse, PartsOverviewResponse } from './parts.types';

export function getPartsOverview() {
  return api.get<PartsOverviewResponse>('/parts');
}

export function mergeMachine(
  minerId: number,
  plates: { slug: string; rarity: string }[] = [],
  source: MergeMachineSource = 'catalog',
  currentLevel = 1,
  paymentAsset: MergePaymentAsset = 'BLK',
) {
  return api.post<PartsMergeResponse>('/parts/merge', { minerId, plates, source, currentLevel, paymentAsset });
}

export function craftPart(partSlug: string, fromRarity: string, count = 1) {
  return api.post<{
    ok: boolean;
    partSlug: string;
    fromRarity: string;
    targetRarity: string;
    consumed: number;
    crafted: number;
    fromQuantity: number;
    targetQuantity: number;
    message?: string;
  }>('/parts/craft', { partSlug, fromRarity, count });
}
