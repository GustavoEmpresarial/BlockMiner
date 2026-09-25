import { BANNER_TYPES, type AdminBannerRow, type BannerFormState, type BannerTypeValue } from './banners.types';

export function isVideoMediaUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return /\.(mp4|webm|ogg|mov|avi)$/i.test(url.trim());
}

export function resolveBannerMediaUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:)/i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  if (trimmed.startsWith('uploads/')) return `/${trimmed}`;
  return trimmed;
}

export function TypeBadge({ type }: { type: string }) {
  const cfg = BANNER_TYPES.find((t) => t.value === type) || BANNER_TYPES[0];
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

export function mergeBannerInitial(row: AdminBannerRow): BannerFormState {
  const starts =
    row.startsAt != null
      ? typeof row.startsAt === 'string'
        ? row.startsAt.slice(0, 16)
        : new Date(row.startsAt).toISOString().slice(0, 16)
      : '';
  const ends =
    row.endsAt != null
      ? typeof row.endsAt === 'string'
        ? row.endsAt.slice(0, 16)
        : new Date(row.endsAt).toISOString().slice(0, 16)
      : '';
  const typeVal = BANNER_TYPES.some((t) => t.value === row.type)
    ? (row.type as BannerTypeValue)
    : 'promo';

  return {
    title: row.title,
    message: row.message || '',
    imageUrl: row.imageUrl || '',
    type: typeVal,
    link: row.link || '',
    linkLabel: row.linkLabel || '',
    isActive: row.isActive,
    startsAt: starts,
    endsAt: ends,
  };
}
