import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getCookieConsent,
  hasNonEssentialCookieConsent,
  setCookieConsent,
  onCookieConsentChange,
} from './cookieConsent';

beforeEach(() => {
  localStorage.clear();
});

describe('getCookieConsent / hasNonEssentialCookieConsent', () => {
  it('returns null (no consent recorded) before any choice is made', () => {
    expect(getCookieConsent()).toBeNull();
    expect(hasNonEssentialCookieConsent()).toBe(false);
  });

  it('reflects "accepted" once set', () => {
    setCookieConsent('accepted');
    expect(getCookieConsent()).toBe('accepted');
    expect(hasNonEssentialCookieConsent()).toBe(true);
  });

  it('reflects "declined" once set, and non-essential consent stays false', () => {
    setCookieConsent('declined');
    expect(getCookieConsent()).toBe('declined');
    expect(hasNonEssentialCookieConsent()).toBe(false);
  });

  it('ignores garbage previously written to the storage key (never throws, treats as no consent)', () => {
    localStorage.setItem('blockminer_cookie_consent', 'yes-please');
    expect(getCookieConsent()).toBeNull();
    expect(hasNonEssentialCookieConsent()).toBe(false);
  });

  it('never throws even if localStorage.getItem/setItem throw (private mode / quota)', () => {
    const originalGet = Storage.prototype.getItem;
    const originalSet = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => getCookieConsent()).not.toThrow();
      expect(() => setCookieConsent('accepted')).not.toThrow();
    } finally {
      Storage.prototype.getItem = originalGet;
      Storage.prototype.setItem = originalSet;
    }
  });
});

describe('onCookieConsentChange', () => {
  it('fires the handler with the choice when setCookieConsent is called after subscribing', () => {
    const handler = vi.fn();
    const unsubscribe = onCookieConsentChange(handler);
    try {
      setCookieConsent('accepted');
      expect(handler).toHaveBeenCalledWith('accepted');
      setCookieConsent('declined');
      expect(handler).toHaveBeenCalledWith('declined');
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });

  it('stops firing after unsubscribe', () => {
    const handler = vi.fn();
    const unsubscribe = onCookieConsentChange(handler);
    unsubscribe();
    setCookieConsent('accepted');
    expect(handler).not.toHaveBeenCalled();
  });
});
