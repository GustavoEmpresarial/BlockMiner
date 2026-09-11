/**
 * Cookie consent state — gates non-essential cookies/scripts (Meta Pixel, GA) behind an
 * explicit choice, per the Cookie Policy (/cookie-policy). Strictly necessary cookies
 * (session, CSRF) are never gated here — they're required for the site to function at all
 * and are covered separately in that same policy.
 *
 * Persisted in localStorage (survives across tabs/sessions until the user clears site data,
 * which is also how they can "change their mind" — matches what the Cookie Policy tells
 * them). A CustomEvent lets already-mounted code (e.g. the landing page's Meta Pixel init)
 * react immediately to a choice made after first paint, without requiring a reload.
 */

export type CookieConsentChoice = 'accepted' | 'declined';

const STORAGE_KEY = 'blockminer_cookie_consent';
const EVENT_NAME = 'blockminer:cookie-consent-changed';

export function getCookieConsent(): CookieConsentChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'accepted' || raw === 'declined' ? raw : null;
  } catch {
    return null;
  }
}

export function hasNonEssentialCookieConsent(): boolean {
  return getCookieConsent() === 'accepted';
}

export function setCookieConsent(choice: CookieConsentChoice): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* private mode / storage disabled — the banner will just reappear next visit */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: choice }));
  } catch {
    /* ignore */
  }
}

export function onCookieConsentChange(handler: (choice: CookieConsentChoice) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<CookieConsentChoice>).detail;
    if (detail === 'accepted' || detail === 'declined') handler(detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
