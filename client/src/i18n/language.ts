function firstNonEmpty(values: readonly unknown[] = []): string {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function normalizeExplicitLanguage(raw: unknown): 'pt-BR' | 'es' | 'en' | null {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith('pt')) return 'pt-BR';
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('en')) return 'en';
  return null;
}

export function normalizeBrowserLanguage(raw: unknown): 'pt-BR' | 'es' | 'en' {
  // Portuguese browsers get pt-BR, Spanish browsers get es; every other visitor
  // (en-*, fr, de, ru, no language at all) gets English, the international default.
  const value = String(raw || '').trim().toLowerCase();
  if (value.startsWith('pt')) return 'pt-BR';
  if (value.startsWith('es')) return 'es';
  return 'en';
}

export function extractCookieLanguage(cookieString = ''): string | null {
  const match = String(cookieString || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('i18next='));
  if (!match) return null;
  return decodeURIComponent(match.slice('i18next='.length));
}

export interface ResolveInitialLanguageOptions {
  search?: string;
  storedLanguage?: string;
  storedLanguageUserSet?: boolean;
  cookieString?: string;
  htmlLang?: string;
  navigatorLanguage?: string;
  navigatorLanguages?: readonly string[];
}

export function resolveInitialLanguage(options: ResolveInitialLanguageOptions = {}): 'pt-BR' | 'es' | 'en' {
  const {
    search = '',
    storedLanguage = '',
    storedLanguageUserSet = false,
    cookieString = '',
    htmlLang = '',
    navigatorLanguage = '',
    navigatorLanguages = [],
  } = options;

  const queryLanguage = (() => {
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    return params.get('lng');
  })();

  const explicit = firstNonEmpty([
    queryLanguage,
    storedLanguageUserSet ? storedLanguage : '',
    extractCookieLanguage(cookieString),
  ]);
  const explicitLanguage = normalizeExplicitLanguage(explicit);
  if (explicitLanguage) return explicitLanguage;

  // `htmlLang` is the static lang="pt-BR" of index.html at boot, not a visitor signal,
  // so it must not turn a browser with no language into Portuguese.
  void htmlLang;
  const browserRaw = firstNonEmpty([
    ...(Array.isArray(navigatorLanguages) ? navigatorLanguages : []),
    navigatorLanguage,
  ]);
  return normalizeBrowserLanguage(browserRaw);
}

export function resolveFallbackLanguages(activeLanguage: unknown): string[] {
  const normalized = normalizeExplicitLanguage(activeLanguage) || 'pt-BR';
  // Active language first, then other locales for missing keys.
  // English used to fall back to pt-BR first — that made incomplete EN look "stuck" in Portuguese.
  if (normalized === 'pt-BR') return ['pt-BR', 'es', 'en'];
  if (normalized === 'es') return ['es', 'pt-BR', 'en'];
  return ['en', 'pt-BR', 'es'];
}
