import { describe, expect, it } from 'vitest';

describe('inventory2 barrel', () => {
  it('re-exports Inventory2Page', async () => {
    const mod = await import('./index');
    expect(mod.Inventory2Page).toBeTypeOf('function');
  });
});
