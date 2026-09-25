export const BANNER_TYPE_VALUES = ['info', 'warning', 'success', 'promo'] as const;
export type BannerTypeValue = (typeof BANNER_TYPE_VALUES)[number];

export type BannerFormState = {
  title: string;
  message: string;
  imageUrl: string;
  type: BannerTypeValue;
  link: string;
  linkLabel: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
};

export type AdminBannerRow = {
  id: number;
  title: string;
  message?: string | null;
  imageUrl?: string | null;
  type: string;
  link?: string | null;
  linkLabel?: string | null;
  isActive: boolean;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type AdminBannersListResponse =
  | { ok: true; banners?: AdminBannerRow[] }
  | { ok: false; code?: string; message?: string };

export type AdminBannerMutationResponse = {
  ok: boolean;
  banner?: AdminBannerRow;
  code?: string;
  message?: string;
};

export type UploadMediaResponse =
  | { ok: true; url: string }
  | { ok: false; code?: string; message?: string };

export interface BannerTypeConfig {
  value: BannerTypeValue;
  label: string;
  color: string;
}

export const BANNER_TYPES: readonly BannerTypeConfig[] = [
  { value: 'info', label: 'Info', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'warning', label: 'Aviso', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { value: 'success', label: 'Sucesso', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { value: 'promo', label: 'Promo', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
] as const;

export const EMPTY_BANNER_FORM: BannerFormState = {
  title: '',
  message: '',
  imageUrl: '',
  type: 'promo',
  link: '',
  linkLabel: '',
  isActive: true,
  startsAt: '',
  endsAt: '',
};
