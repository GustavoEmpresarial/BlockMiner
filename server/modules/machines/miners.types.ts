import type { Prisma } from "@prisma/client";

export type CatalogMinerRow = Prisma.MinerGetPayload<{}>;

export interface CreateMinerInput {
  name: string;
  slug?: string;
  description?: string | null;
  baseHashRate: number;
  price: number;
  slotSize?: number;
  imageUrl?: string | null;
  tier?: string;
  sourceType?: string;
  isActive?: boolean;
  showInShop?: boolean;
  sortOrder?: number;
}

export interface UpdateMinerInput {
  name?: string;
  slug?: string;
  description?: string | null;
  baseHashRate?: number;
  price?: number;
  slotSize?: number;
  imageUrl?: string | null;
  tier?: string;
  sourceType?: string;
  isActive?: boolean;
  showInShop?: boolean;
  isArchived?: boolean;
  sortOrder?: number;
}

export interface RelinkOrphanInput {
  minerName: string;
}

export interface AssignBrokenMachineInput {
  minerName: string;
  hashRate: number;
  location: "RACK" | "INVENTORY" | "WAREHOUSE";
  catalogMinerId?: number | null;
  eventMinerId?: number | null;
}

export interface AdminMinersListFilter {
  q?: string;
  includeArchived?: boolean;
}
