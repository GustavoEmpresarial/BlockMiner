import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');

function readPublic(name: string): string {
  return readFileSync(path.join(pub, name), 'utf8');
}

describe('public SEO assets', () => {
  it('ships robots.txt, sitemap.xml, llms.txt, llm.txt', () => {
    for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt', 'llm.txt', 'favicon.ico']) {
      expect(existsSync(path.join(pub, f)), f).toBe(true);
    }
  });

  it('robots.txt points at sitemap and blocks private surfaces', () => {
    const robots = readPublic('robots.txt');
    expect(robots).toContain('Sitemap: https://blockminer.space/sitemap.xml');
    expect(robots).toContain('Disallow: /dashboard');
    expect(robots).toContain('Disallow: /wallet');
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toContain('Allow: /login');
  });

  it('sitemap.xml lists only public URLs', () => {
    const xml = readPublic('sitemap.xml');
    expect(xml).toContain('https://blockminer.space/');
    expect(xml).toContain('https://blockminer.space/register');
    expect(xml).toContain('https://blockminer.space/login');
    expect(xml).not.toContain('/dashboard');
    expect(xml).not.toContain('/wallet');
    expect(xml).not.toContain('/shop');
  });

  it('llms.txt follows llmstxt.org shape (H1 + blockquote)', () => {
    const md = readPublic('llms.txt');
    expect(md.startsWith('# BlockMiner')).toBe(true);
    expect(md).toMatch(/^> /m);
    expect(md).toContain('https://blockminer.space/');
    expect(readPublic('llm.txt')).toBe(md);
  });

  it('does not keep heavy assets in public/ (media volume owns them)', () => {
    expect(existsSync(path.join(pub, 'models'))).toBe(false);
    expect(existsSync(path.join(pub, 'walletconnect-logo.svg'))).toBe(false);
  });
});
