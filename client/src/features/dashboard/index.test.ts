import { describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/auth/auth.store', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

describe('dashboard/index barrel', () => {
  it('re-exports DashboardPage and the api/types modules without throwing', async () => {
    const mod = await import('./index');
    expect(mod.DashboardPage).toBeTypeOf('function');
    expect(mod.getWalletBalance).toBeTypeOf('function');
    expect(mod.getMiningCycle).toBeTypeOf('function');
  });
});
