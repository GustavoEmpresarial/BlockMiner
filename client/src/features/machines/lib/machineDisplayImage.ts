import { resolveOwnedMachineImageUrl } from './machines.shared';
import type { MachineImageSource } from './machines.types';

export type MachineImageRow = {
  imageUrl?: string | null;
  imageSource?: MachineImageSource | null;
};

/**
 * Resolved image URL for UI (null → MachineImage placeholder).
 * Ported from legacy/client/src/pages/machines/machineDisplayImage.ts.
 *
 * IMAGE URL PATTERN: rows already carry a full `/media/miners/<file>.webp`-style URL resolved
 * server-side (server/modules/inventory/inventory.types.ts `resolveOwnedMachineImageUrl` — see
 * MEDIA_PUBLIC_PREFIX="/media" + category "miners" in server/modules/media/media.config.ts). This
 * function does not build the URL itself, it only picks which candidate URL (API-resolved vs. raw
 * row field) to trust, mirroring the server's own precedence rules.
 *
 * Stock miner / brand / icon images are seeded at boot from `assets/media-seed/` into
 * `storage/uploads/media/` (see server/modules/media/media.seed.ts). Vite proxies `/media`
 * to the backend in local dev so <img src="/media/..."> resolves to real files.
 */
export function getMachineDisplayImageUrl(row: MachineImageRow): string | null {
  if (row.imageSource) {
    return resolveOwnedMachineImageUrl({
      apiImageUrl: row.imageUrl ?? null,
      apiImageSource: row.imageSource,
    }).imageUrl;
  }
  return resolveOwnedMachineImageUrl({ rowImageUrl: row.imageUrl ?? null }).imageUrl;
}
