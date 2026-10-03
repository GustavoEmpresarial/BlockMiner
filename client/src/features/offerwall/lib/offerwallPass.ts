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
 * - Uses programmatic anchor tag with rel="noopener" to preserve Referer header while preventing tabnabbing.
 * - Falls back to window.open if DOM anchor execution is blocked.
 */
export function openPartnerSafe(url: string): void {
  const u = String(url || '').trim();
  if (!u) return;

  if (typeof window !== 'undefined' && typeof window._BmPartnerIframe === 'function') {
    window._BmPartnerIframe(u);
    return;
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
      return;
    } catch {
      /* fallback to window.open below */
    }
  }

  if (typeof window !== 'undefined') {
    window.open(u, '_blank', 'noopener');
  }
}

/**
 * Resolves an external offerwall link (e.g. /offerwallme/link, /zerads/link).
 * Handles BM Captcha pass requirements transparently:
 * 1. Attempts direct fetch (succeeds when BM_CAPTCHA_ENABLED=0 or pass already held).
 * 2. If rejected with 403 CAPTCHA_PASS_REQUIRED, triggers window.BmCaptchaGate.ensure(provider) and retries.
 */
export async function fetchOfferwallLinkWithPass(
  provider: BmCaptchaProvider,
  endpoint: string,
): Promise<string | null> {
  try {
    const res = await api.get(endpoint);
    const initialUrl = (res.data?.url as string | undefined) ?? null;
    if (initialUrl) return initialUrl;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;

    if (status === 403 && (code === 'CAPTCHA_PASS_REQUIRED' || code === 'CAPTCHA_PASS_INVALID')) {
      if (typeof window !== 'undefined' && window.BmCaptchaGate?.ensure) {
        try {
          const passToken = await window.BmCaptchaGate.ensure(provider);
          const retryRes = await api.get(endpoint, {
            headers: passToken ? { 'x-bm-captcha-pass': passToken } : undefined,
          });
          return (retryRes.data?.url as string | undefined) ?? null;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
