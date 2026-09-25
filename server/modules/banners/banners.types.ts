/** Ported from legacy/server/modules/banners/. Shapes mirror the DashboardBanner Prisma model. */

export const BANNER_TYPE_VALUES = ["info", "warning", "success", "promo"] as const;
export type BannerTypeValue = (typeof BANNER_TYPE_VALUES)[number];

export function isValidBannerType(val: unknown): val is BannerTypeValue {
  return typeof val === "string" && (BANNER_TYPE_VALUES as readonly string[]).includes(val);
}

export type BannerWriteBody = {
  title?: string;
  message?: string;
  imageUrl?: string | null;
  type?: string;
  link?: string | null;
  linkLabel?: string | null;
  isActive?: boolean;
  startsAt?: unknown;
  endsAt?: unknown;
};

export interface DashboardBannerDto {
  id: number;
  title: string;
  message: string;
  imageUrl: string | null;
  type: string;
  link: string | null;
  linkLabel: string | null;
  isActive: boolean;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/**
 * Admin banner windows are calendar days in UTC, always at 00:00:00.000Z.
 * Accepts `YYYY-MM-DD` or any ISO-like string — uses the date part only.
 */
export function parseBannerUtcMidnight(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

