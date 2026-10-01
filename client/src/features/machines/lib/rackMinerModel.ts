/** Only the MinerCore MCX9 offer carries a GLB. Every other rack miner stays a PNG. */
export const MINERCORE_MCX9_MODEL_URL = '/media/models/minercore-mcx9.glb';
/** Drag payload so a 3D-room bay can ignore PNG miners during dragover. */
export const SHOWCASE_3D_DRAG_TYPE = 'application/x-blockminer-3d';

const SAFE_MODEL_URL = /^\/media\/models\/[a-z0-9][a-z0-9._-]*\.glb$/i;

export function rackMinerModelUrl(
  machine: { minerName?: string | null; imageUrl?: string | null; modelUrl?: string | null } | null | undefined,
): string | null {
  if (!machine) return null;
  const explicit = typeof machine.modelUrl === 'string' ? machine.modelUrl.trim() : '';
  if (SAFE_MODEL_URL.test(explicit)) return explicit;
  const name = String(machine.minerName ?? '')
    .replace(/^\[event\]\s*/i, '')
    .trim();
  if (name === 'MinerCore MCX9') return MINERCORE_MCX9_MODEL_URL;
  const image = String(machine.imageUrl ?? '');
  if (image.includes('/minercore-mcx9')) return MINERCORE_MCX9_MODEL_URL;
  return null;
}

export function dragCarriesShowcase3d(dt: DataTransfer): boolean {
  return Array.from(dt.types ?? []).includes(SHOWCASE_3D_DRAG_TYPE);
}

export function markShowcase3dDrag(
  dt: DataTransfer,
  machine: { minerName?: string | null; imageUrl?: string | null; modelUrl?: string | null } | null | undefined,
): void {
  if (rackMinerModelUrl(machine)) dt.setData(SHOWCASE_3D_DRAG_TYPE, '1');
}
