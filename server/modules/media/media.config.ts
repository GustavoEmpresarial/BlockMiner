/**
 * Central media module config — where images live on disk and how they are served publicly.
 *
 * Ported from legacy/server/modules/media/media.config.ts, adapted to current/'s doctrine (flat
 * module, no separate `utils/uploadsRoot` helper — the disk root is resolved right here.
 *
 * On-disk layout: `<projectRoot>/storage/uploads/media/<category>/<file>`. All runtime-generated data
 * (as opposed to source/config) lives under `<projectRoot>/storage/` — a single gitignored directory —
 * instead of scattering top-level folders like legacy did (uploads/, backups/ side by side with
 * server/, prisma/, docs/). The directory is created lazily on first write and is intentionally NOT
 * under `dist/` or `server/` so it survives a `tsc` rebuild; it should be treated as a persistent
 * volume in deployment. UPLOADS_DIR env var overrides the whole uploads root if set (matching
 * legacy's convention), independent of the storage/ consolidation.
 */
import path from "path";
import { existsSync, mkdirSync } from "fs";

export const MEDIA_CATEGORIES = [
  "miners",
  "banners",
  "offers",
  "transparency",
  "burn",
  "support",
  "broadcast",
  "social",
  "partner-games",
  "sala",
  "racks",
  "fans",
  "icons",
  "brand",
  /** 3D / binary scene assets (e.g. Antminer GLB for transparency hardware). */
  "models",
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/** Public URL prefix under which the media static handler is mounted. */
export const MEDIA_PUBLIC_PREFIX = process.env.MEDIA_PUBLIC_PREFIX?.trim() || "/media";

/** True when `slug` is a known media category. */
export function isMediaCategory(slug: string): slug is MediaCategory {
  return (MEDIA_CATEGORIES as readonly string[]).includes(slug);
}

/**
 * Real bug found deploying to Docker for the first time (11/08/2026, PROGRESSO.txt item 60):
 * walking up from import.meta.url landed on `dist/` after tsc. `process.cwd()` is correct for
 * both `npm run dev` and Docker CMD (`node dist/server/bootstrap/server.js`) from project root.
 */
export function projectRoot(): string {
  return process.cwd();
}

/** Absolute on-disk uploads root, overridable via UPLOADS_DIR (persistent volume in prod). */
function uploadsRoot(): string {
  if (process.env.UPLOADS_DIR?.trim()) {
    return path.resolve(process.env.UPLOADS_DIR.trim());
  }
  return path.join(projectRoot(), "storage", "uploads");
}

/** Absolute on-disk root of the media tree (`<uploadsRoot>/media`), created if missing. */
export function mediaRootDir(): string {
  const dir = path.join(uploadsRoot(), "media");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Absolute on-disk directory for a category (`<uploadsRoot>/media/<category>`), created if missing. */
export function mediaDiskDir(category: string): string {
  const dir = path.join(mediaRootDir(), category);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Public URL for a stored file, e.g. `/media/miners/1779-x.webp`. */
export function mediaPublicPath(category: string, filename: string): string {
  return `${MEDIA_PUBLIC_PREFIX}/${category}/${filename}`;
}
