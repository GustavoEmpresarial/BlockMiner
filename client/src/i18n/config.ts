import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resolveFallbackLanguages, resolveInitialLanguage } from './language';

type LocaleBundle = 'en' | 'pt-BR' | 'es';

const localeLoaders: Record<LocaleBundle, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('./locales/en.json'),
  'pt-BR': () => import('./locales/pt-BR.json'),
  es: () => import('./locales/es.json'),
};

const aliasMap: Record<LocaleBundle, string[]> = {
  en: ['en'],
  'pt-BR': ['pt-BR', 'pt', 'pt-PT'],
  es: ['es', 'es-ES'],
};

function bundleKey(lng: string | undefined | null): LocaleBundle {
  const v = String(lng || '').toLowerCase();
  if (v.startsWith('pt')) return 'pt-BR';
  if (v.startsWith('es')) return 'es';
  return 'en';
}

function readStoredLanguage() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage?.getItem('i18nextLng') || '';
  } catch {
    return '';
  }
}

function readStoredLanguageUserSet() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem('i18nextLngUserSet') === '1';
  } catch {
    return false;
  }
}

const initialLanguage = resolveInitialLanguage({
  search: typeof window !== 'undefined' ? window.location.search : '',
  storedLanguage: readStoredLanguage(),
  storedLanguageUserSet: readStoredLanguageUserSet(),
  cookieString: typeof document !== 'undefined' ? document.cookie : '',
  htmlLang: typeof document !== 'undefined' ? document.documentElement?.lang : '',
  navigatorLanguage: typeof navigator !== 'undefined' ? navigator.language : '',
  navigatorLanguages: typeof navigator !== 'undefined' ? navigator.languages : [],
});

const loadedBundles = new Set<LocaleBundle>();

function registerBundle(key: LocaleBundle, translation: Record<string, unknown>) {
  for (const alias of aliasMap[key]) {
    i18n.addResourceBundle(alias, 'translation', translation, true, true);
  }
  loadedBundles.add(key);
}

async function ensureLocaleBundle(lng: string | undefined | null): Promise<LocaleBundle> {
  const key = bundleKey(lng);
  if (loadedBundles.has(key)) return key;
  const mod = await localeLoaders[key]();
  registerBundle(key, mod.default);
  return key;
}

i18n.use(initReactI18next);

/** Resolves when the active locale JSON is loaded and i18n is initialized. */
export const i18nReady: Promise<typeof i18n> = (async () => {
  const key = bundleKey(initialLanguage);
  const mod = await localeLoaders[key]();
  const resources: Record<string, { translation: Record<string, unknown> }> = {};
  for (const alias of aliasMap[key]) {
    resources[alias] = { translation: mod.default };
  }
  loadedBundles.add(key);

  await i18n.init({
    resources,
    lng: initialLanguage,
    showSupportNotice: false,
    debug: Boolean(import.meta.env?.DEV),
    fallbackLng: (code) => resolveFallbackLanguages(code),
    supportedLngs: ['en', 'pt-BR', 'pt', 'pt-PT', 'es', 'es-ES'],
    interpolation: {
      escapeValue: false,
    },
  });
  return i18n;
})();

i18n.on('languageChanged', (lng) => {
  const map: Record<string, string> = {
    en: 'en',
    pt: 'pt-BR',
    'pt-BR': 'pt-BR',
    'pt-PT': 'pt-PT',
    es: 'es',
    'es-ES': 'es-ES',
  };
  const normalized = map[lng] ?? lng ?? 'pt-BR';
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem('i18nextLng', normalized);
    } catch {
      /* private mode / storage disabled */
    }
  }
  if (typeof document === 'undefined') return;
  document.documentElement.lang = normalized;
});

/**
 * Switches language SAFELY — loads the target locale's JSON bundle (dynamic import,
 * lazy-chunked) BEFORE flipping i18next's active language. Calling `i18n.changeLanguage()`
 * directly races: it fires `languageChanged` (which forces every `useTranslation()` consumer
 * to re-render) synchronously, but the target bundle was only registered inside that same
 * event's *async* handler — so every component re-renders one tick too early, sees no
 * resources for the new language, falls back to the previous language's text, and (since
 * `addResourceBundle` doesn't itself emit `languageChanged`) never re-renders again. The
 * screen looks stuck in the old language until a full page reload (which awaits `i18nReady`
 * up front). Loading the bundle first — and only THEN calling `changeLanguage` — avoids the
 * race entirely: the resources already exist by the time components re-render.
 */
export async function changeLanguageSafe(lng: string): Promise<void> {
  await ensureLocaleBundle(lng);
  await i18n.changeLanguage(lng);
}

export default i18n;
