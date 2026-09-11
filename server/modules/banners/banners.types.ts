/** Ported from legacy/server/modules/banners/. Shapes mirror the DashboardBanner Prisma model. */

export type BannerWriteBody = {
  title?: string;
  message?: string;
  imageUrl?: string;
  type?: string;
  link?: string;
  linkLabel?: string;
  isActive?: boolean;
  startsAt?: unknown;
  endsAt?: unknown;
};

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
