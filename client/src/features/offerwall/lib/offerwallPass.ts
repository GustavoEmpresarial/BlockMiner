import { api } from '../../../shared/auth/auth.store';
import type { BmCaptchaProvider } from '../../bm-captcha/bm-captcha.types';

declare global {
  interface Window {
    _BmPartnerIframe?: (url: string) => boolean;
    BmCaptchaGate?: {
      ensure: (provider: string) => Promise<string>;
      show: (provider: string) => Promise<string>;
      openWithPass: (
        provider: string,
        fetchUrlWithPass: (pass: string) => Promise<string>,
        onUrl?: (url: string) => void,
      ) => Promise<string>;
    };
  }
}

/**
 * Safely opens external offerwall partner URL in a new tab:
 * - Checks test/embedded harness hook (_BmPartnerIframe) first.
 * - Tries direct window.open first with 'noopener' to preserve Referer header while preventing tabnabbing.
 * - If window.open returns null or throws, popup was blocked by browser; returns false reliably.
 * - If window.open is not available (e.g. specialized webview), falls back to programmatic anchor click.
 * - Returns true if navigation was dispatched, or false if blocked by browser.
 */
export function openPartnerSafe(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;

  if (typeof window !== 'undefined' && typeof window._BmPartnerIframe === 'function') {
    return Boolean(window._BmPartnerIframe(u));
  }

  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    try {
      const win = window.open(u, '_blank', 'noopener');
      if (win) {
        return true;
      }
      // When window.open returns null, popup was blocked by the browser.
      // Synthetic a.click() without an active user gesture will also be blocked,
      // so return false reliably to allow UI to guide user to direct link.
      return false;
    } catch {
      return false;
    }
  }

  if (typeof document !== 'undefined' && document.body) {
    try {
      const a = document.createElement('a');
      a.href = u;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('aria-hidden', 'true');
      a.setAttribute('data-bm-partner-nav', '1');
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export type OfferwallPassResult =
  | { ok: true; url: string }
  | {
      ok: false;
      code: 'CAPTCHA_CANCELLED' | 'CAPTCHA_REQUIRED' | 'UNAUTHENTICATED' | 'NETWORK_ERROR' | 'SERVER_ERROR';
      message?: string;
    };

/**
 * Resolves an external offerwall link (e.g. /offerwallme/link, /zerads/link).
 * Handles BM Captcha pass requirements transparently:
 * 1. Attempts direct fetch (succeeds when BM_CAPTCHA_ENABLED=0 or pass already held).
 * 2. If rejected with 403 CAPTCHA_PASS_REQUIRED, triggers window.BmCaptchaGate.ensure(provider) and retries.
 * 3. Returns a structured result with error classifications for observability and UI feedback.
 */
export async function fetchOfferwallLinkWithPass(
  provider: BmCaptchaProvider,
  endpoint: string,
): Promise<OfferwallPassResult> {
  try {
    const res = await api.get(endpoint);
    const initialUrl = (res.data?.url as string | undefined) ?? null;
    if (initialUrl) {
      return { ok: true, url: initialUrl };
    }
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;

    if (status === 401) {
      return { ok: false, code: 'UNAUTHENTICATED', message: 'Authentication required' };
    }

    if (status === 403 && (code === 'CAPTCHA_PASS_REQUIRED' || code === 'CAPTCHA_PASS_INVALID')) {
      if (typeof window !== 'undefined' && window.BmCaptchaGate?.ensure) {
        let passToken = '';
        try {
          passToken = await window.BmCaptchaGate.ensure(provider);
        } catch {
          return { ok: false, code: 'CAPTCHA_CANCELLED', message: 'Captcha verification cancelled' };
        }

        try {
          const retryRes = await api.get(endpoint, {
            headers: passToken ? { 'x-bm-captcha-pass': passToken } : undefined,
          });
          const retryUrl = (retryRes.data?.url as string | undefined) ?? null;
          if (retryUrl) {
            return { ok: true, url: retryUrl };
          }
          return { ok: false, code: 'SERVER_ERROR', message: 'Empty URL response from server' };
        } catch (retryErr: unknown) {
          const rStatus = (retryErr as { response?: { status?: number } })?.response?.status;
          if (!rStatus) {
            return { ok: false, code: 'NETWORK_ERROR', message: 'Network connection failed' };
          }
          return { ok: false, code: 'SERVER_ERROR', message: 'Failed to retrieve offerwall link' };
        }
      }

      return { ok: false, code: 'CAPTCHA_REQUIRED', message: 'Captcha verification required' };
    }

    if (!status) {
      return { ok: false, code: 'NETWORK_ERROR', message: 'Network connection failed' };
    }

    return { ok: false, code: 'SERVER_ERROR', message: 'Server error loading offerwall' };
  }

  return { ok: false, code: 'SERVER_ERROR', message: 'Unknown error' };
}
