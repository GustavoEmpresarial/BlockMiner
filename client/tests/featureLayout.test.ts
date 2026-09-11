import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

describe('client feature layout', () => {
  it('has no leftover src/store or src/types bags', () => {
    expect(existsSync(path.join(srcRoot, 'store'))).toBe(false);
    expect(existsSync(path.join(srcRoot, 'types'))).toBe(false);
  });

  it('keeps auth store under shared/auth', () => {
    expect(existsSync(path.join(srcRoot, 'shared/auth/auth.store.ts'))).toBe(true);
  });

  it('keeps game store under features/shell', () => {
    expect(existsSync(path.join(srcRoot, 'features/shell/lib/game.store.ts'))).toBe(true);
  });

  it('features are directories with at least one entry', () => {
    const featuresDir = path.join(srcRoot, 'features');
    const dirs = readdirSync(featuresDir).filter((name) =>
      statSync(path.join(featuresDir, name)).isDirectory(),
    );
    expect(dirs.length).toBeGreaterThan(20);
    expect(dirs).toContain('wallet');
    expect(dirs).toContain('dashboard');
    expect(dirs).toContain('landing');
    expect(dirs).toContain('shell');
  });
});
