import i18n from 'i18next';

/**
 * Translate from modules that run outside React (auth store, error boundary) without importing
 * `i18n/config`: that import would initialize i18next as a side effect wherever these modules are
 * loaded. Returns the Portuguese fallback when i18next is not ready or the lookup itself fails.
 */
export function safeT(key: string, fallback: string): string {
  try {
    if (!i18n.isInitialized) return fallback;
    const out = i18n.t(key, { defaultValue: fallback });
    return typeof out === 'string' && out ? out : fallback;
  } catch {
    return fallback;
  }
}
