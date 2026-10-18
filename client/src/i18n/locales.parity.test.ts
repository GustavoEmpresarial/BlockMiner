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
/**
 * Legal documents (Privacy Policy, Terms of Use) stay in English for es until a human legal
 * review: an unreviewed translation could change their legal meaning.
 */
const isLegalBody = (k: string) => k.startsWith('legal.privacyPolicy.sections.') || k.startsWith('legal.termsOfUse.sections.');
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
      (k) => !isAdmin(k) && !isLegalBody(k) && !SAME_IN_EVERY_LANGUAGE.has(k) && E[k] === S[k] && P[k] !== S[k] && !neutral(S[k]),
    );
    expect(copied).toEqual([]);
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
});
