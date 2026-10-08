import { describe, expect, it } from 'vitest';
import { MINERCORE_MCX9_MODEL_URL, SHOWCASE_3D_DRAG_TYPE, dragCarriesShowcase3d, isShowcase3dCatalogMachine, markShowcase3dDrag, rackMinerModelUrl } from './rackMinerModel';

describe('rackMinerModelUrl', () => {
  it('uses a safe model url from the API', () => {
    expect(rackMinerModelUrl({ modelUrl: '/media/models/minercore-mcx9.glb', minerName: 'Other' })).toBe(
      MINERCORE_MCX9_MODEL_URL,
    );
  });

  it('recognizes the MCX9 by name or image when the API has no model url', () => {
    expect(rackMinerModelUrl({ minerName: '[Event] MinerCore MCX9' })).toBe(MINERCORE_MCX9_MODEL_URL);
    expect(rackMinerModelUrl({ imageUrl: '/media/offers/minercore-mcx9.webp' })).toBe(MINERCORE_MCX9_MODEL_URL);
  });

  it('flags a catalog card when the miner is the 3D one', () => {
    expect(isShowcase3dCatalogMachine({ name: 'MinerCore MCX9' })).toBe(true);
    expect(isShowcase3dCatalogMachine({ modelUrl: '/media/models/other.glb' })).toBe(true);
    expect(isShowcase3dCatalogMachine({ name: 'Antminer S19 Pro' })).toBe(false);
  });

  it('leaves ordinary miners as images', () => {
    expect(rackMinerModelUrl({ minerName: 'BlockNova', imageUrl: '/media/miners/blocknova.webp' })).toBeNull();
    expect(rackMinerModelUrl({ modelUrl: 'javascript:alert(1)' })).toBeNull();
    expect(rackMinerModelUrl(null)).toBeNull();
  });

  it('marks only a 3D miner on the drag payload', () => {
    const types = new Set<string>();
    const dt = {
      types,
      setData: (key: string) => types.add(key),
    } as unknown as DataTransfer;
    markShowcase3dDrag(dt, { minerName: 'Gildcore' });
    expect(dragCarriesShowcase3d(dt)).toBe(false);
    markShowcase3dDrag(dt, { modelUrl: MINERCORE_MCX9_MODEL_URL });
    expect(types.has(SHOWCASE_3D_DRAG_TYPE)).toBe(true);
    expect(dragCarriesShowcase3d(dt)).toBe(true);
  });
});
