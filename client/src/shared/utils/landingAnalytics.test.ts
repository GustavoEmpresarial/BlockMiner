import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { persistUtmParams, readStoredUtm, trackLandingEvent, initMetaPixel } from './landingAnalytics';

beforeEach(() => {
  sessionStorage.clear();
  delete window.gtag;
  delete window.fbq;
  delete window._fbq;
  delete window.__blockminerMetaPixelLoaded;
});

describe('persistUtmParams + readStoredUtm', () => {
  it('persists only the known UTM keys present in the query string', () => {
    persistUtmParams('?utm_source=google&utm_medium=cpc&irrelevant=1');
    expect(readStoredUtm()).toEqual({ utm_source: 'google', utm_medium: 'cpc' });
  });

  it('does not write to storage at all when no UTM param is present', () => {
    persistUtmParams('?irrelevant=1');
    expect(sessionStorage.getItem('blockminer_utm')).toBeNull();
  });

  it('readStoredUtm returns {} when nothing was ever stored', () => {
    expect(readStoredUtm()).toEqual({});
  });

  it('readStoredUtm never throws on corrupted JSON, returns {}', () => {
    sessionStorage.setItem('blockminer_utm', 'not-json{{{');
    expect(readStoredUtm()).toEqual({});
  });

  it('readStoredUtm ignores non-string values in stored JSON', () => {
    sessionStorage.setItem('blockminer_utm', JSON.stringify({ utm_source: 'x', utm_medium: 123 }));
    expect(readStoredUtm()).toEqual({ utm_source: 'x' });
  });
});

describe('trackLandingEvent', () => {
  it('never throws when neither gtag nor fbq is present (ad blockers, etc.)', () => {
    expect(() => trackLandingEvent('landing_cta_click', { cta_id: 'hero' })).not.toThrow();
  });

  it('calls window.fbq("trackCustom", ...) with the event name and merged params when fbq exists', () => {
    const fbq = vi.fn();
    window.fbq = fbq;
    persistUtmParams('?utm_source=google');
    trackLandingEvent('landing_cta_click', { cta_id: 'hero' });
    expect(fbq).toHaveBeenCalledWith('trackCustom', 'landing_cta_click', { utm_source: 'google', cta_id: 'hero' });
  });

  it('swallows a throwing fbq instead of crashing the page', () => {
    window.fbq = () => {
      throw new Error('blocked by extension');
    };
    expect(() => trackLandingEvent('landing_cta_click', {})).not.toThrow();
  });

  it('calls window.gtag when VITE_GA_ID is configured and gtag exists', () => {
    vi.stubEnv('VITE_GA_ID', 'G-TEST123');
    const gtag = vi.fn();
    window.gtag = gtag;
    trackLandingEvent('landing_cta_click', { cta_id: 'hero' });
    expect(gtag).toHaveBeenCalledWith('event', 'landing_cta_click', { cta_id: 'hero' });
    vi.unstubAllEnvs();
  });
});

describe('persistUtmParams: storage failure', () => {
  it('never throws even if sessionStorage.setItem itself throws (private-mode / quota)', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded');
    };
    try {
      expect(() => persistUtmParams('?utm_source=google')).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('initMetaPixel', () => {
  afterEach(() => {
    document.querySelectorAll('script[src*="fbevents"]').forEach((el) => el.remove());
  });

  it('is a no-op with no VITE_META_PIXEL_ID configured', () => {
    vi.stubEnv('VITE_META_PIXEL_ID', '');
    initMetaPixel();
    expect(window.fbq).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it('bootstraps window.fbq as a real queueing stub, injects the fbevents script tag once, and fires init+PageView', () => {
    vi.stubEnv('VITE_META_PIXEL_ID', 'PIXEL123');
    const script = document.createElement('script');
    document.head.appendChild(script); // b.getElementsByTagName('script')[0] anchor for insertBefore

    initMetaPixel();

    expect(typeof window.fbq).toBe('function');
    expect(window.__blockminerMetaPixelLoaded).toBe(true);
    const injected = document.querySelector('script[src="https://connect.facebook.net/en_US/fbevents.js"]') as HTMLScriptElement | null;
    expect(injected).not.toBeNull();
    expect(injected?.async).toBe(true);

    // Second call must be a no-op (already loaded) — no duplicate script tag.
    initMetaPixel();
    const allInjected = document.querySelectorAll('script[src="https://connect.facebook.net/en_US/fbevents.js"]');
    expect(allInjected.length).toBe(1);

    document.head.removeChild(script);
    vi.unstubAllEnvs();
  });

  it('when window.fbq already exists (loaded by something else), just calls init+PageView without re-injecting the script', () => {
    vi.stubEnv('VITE_META_PIXEL_ID', 'PIXEL456');
    const fbq = vi.fn();
    window.fbq = fbq;

    initMetaPixel();

    expect(fbq).toHaveBeenCalledWith('init', 'PIXEL456');
    expect(fbq).toHaveBeenCalledWith('track', 'PageView');
    const injected = document.querySelector('script[src="https://connect.facebook.net/en_US/fbevents.js"]');
    expect(injected).toBeNull();
    vi.unstubAllEnvs();
  });

  it('queueFbq stub pushes calls onto its queue before callMethod is assigned (real fbevents.js bootstrap contract)', () => {
    vi.stubEnv('VITE_META_PIXEL_ID', 'PIXEL789');
    const script = document.createElement('script');
    document.head.appendChild(script);

    initMetaPixel();
    window.fbq('track', 'CustomEvent');
    expect(window.fbq.queue.length).toBeGreaterThanOrEqual(1);

    document.head.removeChild(script);
    vi.unstubAllEnvs();
  });
});
