import { toast } from 'sonner';
import type { AdminMinerApiRow } from './adminMiners.types';
import { normalizePersistableMinerImageUrl } from './adminMiners.image';

export type MinerFormState = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  baseHashRate: string | number;
  price: string | number;
  slotSize: string;
  imageUrl: string;
  tier: string;
  sourceType: string;
  isActive: boolean;
  showInShop: boolean;
  isArchived: boolean;
  sortOrder: string | number;
  maxPerUser: string | number;
  stockTotal: string | number;
  availableFrom: string;
  availableUntil: string;
  metadata: string;
  stockSold?: number;
  updatedAt?: string | null;
};

export const EMPTY_FORM: MinerFormState = {
  name: '',
  slug: '',
  description: '',
  longDescription: '',
  baseHashRate: '',
  price: '',
  slotSize: '1',
  imageUrl: '',
  tier: 'common',
  sourceType: 'store',
  isActive: true,
  showInShop: true,
  isArchived: false,
  sortOrder: 0,
  maxPerUser: '',
  stockTotal: '',
  availableFrom: '',
  availableUntil: '',
  metadata: '',
};

export type DrawerMode = 'create' | 'edit' | null;

export function normalizeMiner(m: AdminMinerApiRow): MinerFormState {
  const id = typeof m.id === 'number' ? m.id : Number(m.id);
  return {
    ...EMPTY_FORM,
    ...m,
    id: Number.isFinite(id) ? id : undefined,
    name: String(m.name ?? ''),
    slug: String(m.slug ?? ''),
    description: String(m.description ?? ''),
    longDescription: String(m.longDescription ?? ''),
    baseHashRate: m.baseHashRate != null ? String(m.baseHashRate) : '',
    price: m.price != null ? String(m.price) : '',
    slotSize: String(m.slotSize ?? 1),
    imageUrl: String(m.imageUrl ?? ''),
    tier: String(m.tier ?? 'common'),
    sourceType: String(m.sourceType ?? 'store'),
    isActive: Boolean(m.isActive),
    showInShop: Boolean(m.showInShop ?? m.isStoreVisible),
    isArchived: Boolean(m.isArchived),
    maxPerUser: m.maxPerUser != null ? String(m.maxPerUser) : '',
    stockTotal: m.stockTotal != null ? String(m.stockTotal) : '',
    availableFrom: m.availableFrom ? String(m.availableFrom).slice(0, 16) : '',
    availableUntil: m.availableUntil ? String(m.availableUntil).slice(0, 16) : '',
    metadata: m.metadata && typeof m.metadata === 'object' ? JSON.stringify(m.metadata, null, 2) : '',
    stockSold: typeof m.stockSold === 'number' ? m.stockSold : Number(m.stockSold) || 0,
    updatedAt: m.updatedAt ? String(m.updatedAt) : null,
  };
}

export function copyText(value: string | null | undefined): void {
  if (!value) return;
  void navigator.clipboard?.writeText(String(value));
  toast.success('Copiado');
}

export type MinerSavePayload = {
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  baseHashRate: number;
  price: number;
  slotSize: number;
  imageUrl: string | null;
  tier: string;
  sourceType: string;
  isActive: boolean;
  showInShop: boolean;
  isArchived: boolean;
  sortOrder: number;
  maxPerUser: number | null;
  stockTotal: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  metadata: unknown;
};

export function makePayload(form: MinerFormState, preserveImageUrl: string | null = null): MinerSavePayload {
  let parsedMeta: unknown = null;
  if (form.metadata?.trim()) {
    parsedMeta = JSON.parse(form.metadata) as unknown;
  }
  const trimmedImage = normalizePersistableMinerImageUrl(form.imageUrl);
  let imageUrl: string | null;
  if (trimmedImage) {
    imageUrl = trimmedImage;
  } else if (preserveImageUrl) {
    imageUrl = normalizePersistableMinerImageUrl(preserveImageUrl);
  } else {
    imageUrl = null;
  }
  return {
    name: form.name,
    slug: form.slug,
    description: form.description,
    longDescription: form.longDescription,
    baseHashRate: Number(form.baseHashRate),
    price: Number(form.price),
    slotSize: Number(form.slotSize),
    imageUrl,
    tier: form.tier,
    sourceType: form.sourceType,
    isActive: Boolean(form.isActive),
    showInShop: Boolean(form.showInShop),
    isArchived: Boolean(form.isArchived),
    sortOrder: Number(form.sortOrder || 0),
    maxPerUser: form.maxPerUser === '' ? null : Number(form.maxPerUser),
    stockTotal: form.stockTotal === '' ? null : Number(form.stockTotal),
    availableFrom: form.availableFrom || null,
    availableUntil: form.availableUntil || null,
    metadata: parsedMeta,
  };
}
