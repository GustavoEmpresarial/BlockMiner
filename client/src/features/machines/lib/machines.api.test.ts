import { describe, expect, it, vi, beforeEach } from 'vitest';

const api = { get: vi.fn(), post: vi.fn() };
vi.mock('../../../shared/auth/auth.store', () => ({ api }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('machines.api — thin endpoint wrappers', () => {
  it('getRooms calls GET /rooms with a timeout + signal', async () => {
    const { getRooms } = await import('./machines.api');
    const ac = new AbortController();
    getRooms(ac.signal);
    expect(api.get).toHaveBeenCalledWith('/rooms', { timeout: 25000, signal: ac.signal });
  });

  it('getInventory calls GET /inventory', async () => {
    const { getInventory } = await import('./machines.api');
    getInventory();
    expect(api.get).toHaveBeenCalledWith('/inventory', { timeout: 25000, signal: undefined });
  });

  it('getVault calls GET /vault', async () => {
    const { getVault } = await import('./machines.api');
    getVault();
    expect(api.get).toHaveBeenCalledWith('/vault', { timeout: 25000, signal: undefined });
  });

  it('postBuyRoom calls POST /rooms/buy with no body', async () => {
    const { postBuyRoom } = await import('./machines.api');
    postBuyRoom();
    expect(api.post).toHaveBeenCalledWith('/rooms/buy');
  });

  it('postRackInstall calls POST /rooms/rack/install with rackId + inventoryId', async () => {
    const { postRackInstall } = await import('./machines.api');
    postRackInstall(1, 2);
    expect(api.post).toHaveBeenCalledWith('/rooms/rack/install', { rackId: 1, inventoryId: 2 });
  });

  it('postRackUninstall calls POST /rooms/rack/uninstall with rackId', async () => {
    const { postRackUninstall } = await import('./machines.api');
    postRackUninstall(5);
    expect(api.post).toHaveBeenCalledWith('/rooms/rack/uninstall', { rackId: 5 });
  });

  it('postRackUninstallBatch calls POST /rooms/rack/uninstall-batch with rackIds', async () => {
    const { postRackUninstallBatch } = await import('./machines.api');
    postRackUninstallBatch([1, 2, 3]);
    expect(api.post).toHaveBeenCalledWith('/rooms/rack/uninstall-batch', { rackIds: [1, 2, 3] });
  });

  it('postMoveToVault forwards the body as-is', async () => {
    const { postMoveToVault } = await import('./machines.api');
    postMoveToVault({ source: 'inventory', itemId: 7 });
    expect(api.post).toHaveBeenCalledWith('/vault/move-to-vault', { source: 'inventory', itemId: 7 });
  });

  it('getVisualPlacements calls GET /rooms/visual-placements with a timeout + signal', async () => {
    const { getVisualPlacements } = await import('./machines.api');
    const ac = new AbortController();
    getVisualPlacements(ac.signal);
    expect(api.get).toHaveBeenCalledWith('/rooms/visual-placements', { timeout: 15000, signal: ac.signal });
  });

  it('postVisualPlacement forwards the body', async () => {
    const { postVisualPlacement } = await import('./machines.api');
    postVisualPlacement({ roomNumber: 1, visualIndex: 2, floorSlot: null });
    expect(api.post).toHaveBeenCalledWith('/rooms/visual-placements', { roomNumber: 1, visualIndex: 2, floorSlot: null });
  });

  it('getFanPlacements calls GET /rooms/fan-placements with a timeout + signal', async () => {
    const { getFanPlacements } = await import('./machines.api');
    getFanPlacements();
    expect(api.get).toHaveBeenCalledWith('/rooms/fan-placements', { timeout: 15000, signal: undefined });
  });

  it('postFanPlacement forwards the body', async () => {
    const { postFanPlacement } = await import('./machines.api');
    postFanPlacement({ roomNumber: 1, visualIndex: 0, mounted: true, fromVisualIndex: 3 });
    expect(api.post).toHaveBeenCalledWith('/rooms/fan-placements', { roomNumber: 1, visualIndex: 0, mounted: true, fromVisualIndex: 3 });
  });

  it('postRetrieveFromVault forwards the body', async () => {
    const { postRetrieveFromVault } = await import('./machines.api');
    postRetrieveFromVault({ destination: 'rack', vaultId: 9, slotIndex: 4 });
    expect(api.post).toHaveBeenCalledWith('/vault/retrieve-from-vault', { destination: 'rack', vaultId: 9, slotIndex: 4 });
  });
});
