import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const localesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/i18n/locales',
);

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(localesDir, name), 'utf8')) as Record<string, unknown>;
}

function topKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).sort();
}

describe('i18n locale parity', () => {
  const pt = load('pt-BR.json');
  const es = load('es.json');
  const en = load('en.json');

  it('keeps the same top-level namespaces across pt-BR / es / en', () => {
    expect(topKeys(es)).toEqual(topKeys(pt));
    expect(topKeys(en)).toEqual(topKeys(pt));
  });

  it('has wallet + offerwall + manual + common.cancel in all locales', () => {
    for (const loc of [pt, es, en]) {
      expect(loc.wallet && typeof loc.wallet === 'object').toBe(true);
      expect(loc.offerwall && typeof loc.offerwall === 'object').toBe(true);
      expect(loc.manual && typeof loc.manual === 'object').toBe(true);
      const common = loc.common as Record<string, unknown> | undefined;
      expect(typeof common?.cancel).toBe('string');
    }
  });

  it('defaults product copy for offerwall.access', () => {
    expect((pt.offerwall as { access?: string }).access).toBeTruthy();
    expect((es.offerwall as { access?: string }).access).toBeTruthy();
    expect((en.offerwall as { access?: string }).access).toBeTruthy();
  });
});
