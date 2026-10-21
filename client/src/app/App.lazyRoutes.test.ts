import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Every on-demand route must resolve to a real component. Wrapping an export that is already a
 * React.lazy object in another lazy() crashed /admin/dashboard in prod with React error #306
 * ("lazy element type must resolve to a class or function", got [object Object]).
 */
const appSrc = fs.readFileSync(path.resolve(__dirname, 'App.tsx'), 'utf8');
const re = /const (\w+) = lazyWithRetry\(\(\) => import\('([^']+)'\)\.then\(\(m\) => \(\{ default: m\.(\w+) \}\)\)\);/g;
const routes = [...appSrc.matchAll(re)].map((m) => ({ name: m[1], spec: m[2], exp: m[3] }));

describe('lazy routes in App.tsx', () => {
  it('finds the on-demand routes', () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it.each(routes)('$name resolves to a component, not a lazy/object', { timeout: 30_000 }, async ({ spec, exp }) => {
    const mod = await import(/* @vite-ignore */ path.resolve(__dirname, spec));
    const value = (mod as Record<string, unknown>)[exp];
    expect(value, `${spec} has no export ${exp}`).toBeDefined();
    // React.lazy / memo / forwardRef objects carry $$typeof; a route default must be a plain component.
    expect(typeof value).toBe('function');
  });
});
