export type PartPriceBand = 'starter' | 'mid' | 'high' | 'elite';

export type PartStackDto = {
  slug: string;
  imageUrl: string;
  quantity: number;
};

export type PartMachineCostDto = {
  slug: string;
  required: number;
  owned: number;
};

export type PartMachinePriceDto = {
  id: number;
  slug: string;
  name: string;
  imageUrl: string | null;
  baseHashRate: number;
  band: PartPriceBand;
  costs: PartMachineCostDto[];
};

export type PartsOverviewResponse = {
  ok: boolean;
  parts: PartStackDto[];
  machines: PartMachinePriceDto[];
  message?: string;
};
