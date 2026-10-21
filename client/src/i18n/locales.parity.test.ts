import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import ptBR from './locales/pt-BR.json';
import en from './locales/en.json';
import es from './locales/es.json';

type Tree = { [k: string]: string | string[] | Tree };
function flat(o: Tree, p = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string') out[p + k] = v;
    else if (Array.isArray(v)) v.forEach((x, i) => (out[`${p}${k}.${i}`] = x));
    else Object.assign(out, flat(v, `${p}${k}.`));
  }
  return out;
}
const isAdmin = (k: string) => k.split('.')[0].toLowerCase().startsWith('admin');
/** Plural forms are per language (pt-BR needs `_zero`, others do not). */
const isPluralForm = (k: string) => /_(zero|one|two|few|many|other)$/.test(k);
/** Product names and unit strings that are the same in every language. */
const SAME_IN_EVERY_LANGUAGE = new Set(['checkin.wallet_pay_line', 'powerStats.auto_mining.title']);
/** Proper nouns, units, URLs and code-like strings read the same in every language. */
const neutral = (v: string) =>
  /^[\W\d_]*$/.test(v) || /^https?:\/\//.test(v) || /^[A-Z0-9 _/.:%+()·-]{1,24}$/.test(v) || v.trim().split(/\s+/).length <= 2;

const P = flat(ptBR as Tree);
const E = flat(en as Tree);
const S = flat(es as Tree);

describe('locales', () => {
  it('en and es have every player-facing key that pt-BR has', () => {
    const missingEn = Object.keys(P).filter((k) => !isAdmin(k) && !isPluralForm(k) && !(k in E));
    const missingEs = Object.keys(P).filter((k) => !isAdmin(k) && !isPluralForm(k) && !(k in S));
    expect(missingEn).toEqual([]);
    expect(missingEs).toEqual([]);
  });

  it('es is actually Spanish: player-facing strings are not left as the English copy', () => {
    const copied = Object.keys(S).filter(
      (k) => !isAdmin(k) && !SAME_IN_EVERY_LANGUAGE.has(k) && E[k] === S[k] && P[k] !== S[k] && !neutral(S[k]),
    );
    expect(copied).toEqual([]);
  });

  it('legal documents in es keep every paragraph and bullet of the English original', () => {
    const legal = (o: Record<string, string>) => Object.keys(o).filter((k) => k.startsWith('legal.') && /\.\d+$/.test(k)).sort();
    expect(legal(S)).toEqual(legal(E));
  });

  it('{{placeholders}} match pt-BR in en and es', () => {
    const ph = (v: string) => (v.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((x) => x.replace(/\s/g, '')).sort().join(',');
    const bad: string[] = [];
    for (const k of Object.keys(P)) {
      if (isAdmin(k)) continue;
      if (k in E && ph(E[k]) !== ph(P[k])) bad.push(`en:${k}`);
      if (k in S && ph(S[k]) !== ph(P[k])) bad.push(`es:${k}`);
    }
    expect(bad).toEqual([]);
  });

  it('every literal t(\'key\') used in the code exists in pt-BR, en and es', () => {
    const root = join(__dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) files.push(p);
      }
    };
    walk(root);
    const has = (d: Record<string, string>, k: string) => k in d || `${k}_other` in d || `${k}.0` in d;
    const missing = new Set<string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*['"]([\w-]+(?:\.[\w-]+)+)['"]/g)) {
        const k = m[1];
        if (k === 'some.key') continue;
        for (const [lng, d] of [['pt-BR', P], ['en', E], ['es', S]] as const) if (!has(d, k)) missing.add(`${lng}:${k}`);
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
