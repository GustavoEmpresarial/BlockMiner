export type PartPriceBand = 'starter' | 'mid' | 'high' | 'elite';

export type PartStackDto = {
  slug: string;
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  imageUrl: string;
  quantity: number;
};

export type PartMachineCostDto = {
  slug: string;
  required: number;
  owned: number;
};

export type MergeMachineSource = 'catalog' | 'offer';

export type PartMachinePriceDto = {
  id: number;
  source?: MergeMachineSource;
  slug: string;
  name: string;
  imageUrl: string | null;
  baseHashRate: number;
  basePrice: number;
  mergeFeeBlk: number;
  mergedHashRate: number;
  band: PartPriceBand;
  costs: PartMachineCostDto[];
};

export type OwnedMergeCandidate = {
  id: number;
  minerId: number;
  source?: MergeMachineSource;
  name: string;
  slug: string;
  imageUrl: string | null;
  baseHashRate: number;
  currentLevel: number;
  currentTier: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  currentTierName: string;
  currentTierColor: string;
  currentHashRate: number;
  ownedCount: number;
  hasMachinePair: boolean;
  isMaxLevel: boolean;
  targetLevel: number;
  targetTier: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  targetTierName: string;
  targetTierColor: string;
  targetHashRate: number;
  boostPercent: number;
  mergeFeeBlk: number;
  feeOptions?: MergeFeeOption[];
  hasBlk: boolean;
  hasParts: boolean;
  canMerge: boolean;
  partsRecipe: Array<{
    slug: string;
    rarity: string;
    required: number;
    owned: number;
  }>;
};

export type MergePaymentAsset = 'BLK' | 'POL' | 'SHIB';

export type MergeFeeOption = {
  asset: MergePaymentAsset;
  feePercent: number;
  feeUsd: number;
  amount: number;
  usdPrice: number;
  balance: number;
  affordable: boolean;
};

export type PartsOverviewResponse = {
  ok: boolean;
  currency?: string;
  blkBalance?: number;
  walletBalances?: Record<MergePaymentAsset, number>;
  mergeFeePercentBlk?: number;
  mergeFeePercentCrypto?: number;
  mergeCryptoDiscountPoints?: number;
  mergeFeeBasisPoints?: number;
  mergeHashrateBoostBasisPoints?: number;
  parts: PartStackDto[];
  machines: PartMachinePriceDto[];
  ownedMergeCandidates?: OwnedMergeCandidate[];
  /** Live drop chances in basis points (10000 = 100%). Older servers omit it. */
  dropRates?: PartDropRates;
  message?: string;
};

export type PartDropRates = {
  /** Faucet and PTC. */
  activityBps: number;
  /** Auto-mining, YouTube and shortlinks. */
  frequentActivityBps: number;
  /** Offerwall credits under US$ 0.01. */
  offerwallMicroBps: number;
};

export type PartsMergeResponse = {
  ok: boolean;
  minerId?: number;
  name?: string;
  basePrice?: number;
  mergeFeeBlk?: number;
  paymentAsset?: MergePaymentAsset;
  feePercent?: number;
  feeAmount?: number;
  baseHashRate?: number;
  mergedHashRate?: number;
  currency?: string;
  blkBalance?: number;
  code?: string;
  messageKey?: string;
  message?: string;
};
