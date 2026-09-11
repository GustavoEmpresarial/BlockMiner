import { describe, expect, it, beforeEach, vi } from 'vitest';
import { persistUtmParams, readStoredUtm, trackLandingEvent } from './landingAnalytics';

beforeEach(() => {
  sessionStorage.clear();
  // @ts-expect-error test-only globals
  delete window.gtag;
  // @ts-expect-error test-only globals
  delete window.fbq;
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
    // @ts-expect-error test-only global
    window.fbq = fbq;
    persistUtmParams('?utm_source=google');
    trackLandingEvent('landing_cta_click', { cta_id: 'hero' });
    expect(fbq).toHaveBeenCalledWith('trackCustom', 'landing_cta_click', { utm_source: 'google', cta_id: 'hero' });
  });

  it('swallows a throwing fbq instead of crashing the page', () => {
    // @ts-expect-error test-only global
    window.fbq = () => {
      throw new Error('blocked by extension');
    };
    expect(() => trackLandingEvent('landing_cta_click', {})).not.toThrow();
  });
});
