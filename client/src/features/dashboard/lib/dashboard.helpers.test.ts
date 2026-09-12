import { describe, expect, it, afterEach } from 'vitest';
import {
  buildReferralRegisterUrl,
  displayDashboardUserName,
  mapWalletBalancePayload,
  nextBlockCountdownAnchor,
  pendingPolAccrual,
  sanitizeReferralInput,
  smoothedBlockCountdownSeconds,
  publicSiteOrigin,
} from './dashboard.helpers';

describe('mapWalletBalancePayload', () => {
  it('maps a well-formed payload', () => {
    expect(mapWalletBalancePayload({ balance: 1.5, shibBalance: 200, blkBalance: 3 })).toEqual({
      POL: 1.5,
      SHIB: 200,
      BLK: 3,
    });
  });

  it('falls back to polBalance when balance is absent', () => {
    expect(mapWalletBalancePayload({ polBalance: 2 })).toEqual({ POL: 2, SHIB: 0, BLK: 0 });
  });

  it('defaults every field to 0 on an empty payload (API returned nothing usable)', () => {
    expect(mapWalletBalancePayload({})).toEqual({ POL: 0, SHIB: 0, BLK: 0 });
  });

  it('treats non-numeric / malformed fields as 0 instead of NaN', () => {
    expect(
      mapWalletBalancePayload({
        balance: 'not-a-number' as unknown as number,
        shibBalance: null as unknown as number,
        blkBalance: undefined,
      }),
    ).toEqual({ POL: 0, SHIB: 0, BLK: 0 });
  });

  it('treats Infinity as invalid and falls back to 0', () => {
    expect(mapWalletBalancePayload({ balance: Number.POSITIVE_INFINITY })).toEqual({
      POL: 0,
      SHIB: 0,
      BLK: 0,
    });
  });
});

describe('sanitizeReferralInput', () => {
  it('strips leading zeros from a purely numeric code', () => {
    expect(sanitizeReferralInput('00042')).toBe('42');
  });

  it('keeps a single zero as "0" rather than empty string', () => {
    expect(sanitizeReferralInput('0000')).toBe('0');
  });

  it('strips disallowed characters from alphanumeric codes', () => {
    expect(sanitizeReferralInput('abc<script>_-')).toBe('abcscript_-');
  });

  it('truncates to the max referral code length', () => {
    const long = 'a'.repeat(200);
    expect(sanitizeReferralInput(long).length).toBeLessThanOrEqual(64);
  });

  it('removes control characters before sanitizing', () => {
    expect(sanitizeReferralInput('a\x07b\x1fc')).toBe('abc');
  });

  it('returns empty string for input that is only disallowed characters', () => {
    expect(sanitizeReferralInput('<<<>>>')).toBe('');
  });
});

describe('displayDashboardUserName', () => {
  it('returns an em dash placeholder for null/undefined/empty names', () => {
    expect(displayDashboardUserName(null)).toBe('—');
    expect(displayDashboardUserName(undefined)).toBe('—');
    expect(displayDashboardUserName('')).toBe('—');
  });

  it('strips control characters without escaping/removing safe text', () => {
    expect(displayDashboardUserName('Gustavo\x00')).toBe('Gustavo');
  });

  it('truncates to 120 chars to avoid layout-breaking payloads', () => {
    const long = 'x'.repeat(500);
    expect(displayDashboardUserName(long).length).toBe(120);
  });
});

describe('buildReferralRegisterUrl', () => {
  it('uses the ref code when present', () => {
    expect(buildReferralRegisterUrl(1, 'MYCODE')).toContain('ref=MYCODE');
  });

  it('falls back to the numeric user id when refCode is null/blank', () => {
    expect(buildReferralRegisterUrl(42, null)).toContain('ref=42');
    expect(buildReferralRegisterUrl(42, '   ')).toContain('ref=42');
  });

  it('URL-encodes the code so it cannot break out of the query string', () => {
    expect(buildReferralRegisterUrl(1, 'a&b=c')).toContain(encodeURIComponent('a&b=c'));
  });
});

describe('publicSiteOrigin', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, configurable: true, writable: true });
    delete process.env.APP_URL;
  });

  function stubHostname(hostname: string) {
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, hostname, origin: `https://${hostname}` },
      configurable: true,
      writable: true,
    });
  }

  it('returns a non-empty https origin in a jsdom (non-dev-host) environment', () => {
    const origin = publicSiteOrigin();
    expect(typeof origin).toBe('string');
    expect(origin.length).toBeGreaterThan(0);
  });

  it('always points invites at the prod domain when browsed from dev.blockminer.space', () => {
    stubHostname('dev.blockminer.space');
    expect(publicSiteOrigin()).toBe('https://blockminer.space');
  });

  it('also redirects a subdomain of the dev host to prod', () => {
    stubHostname('staging.dev.blockminer.space');
    expect(publicSiteOrigin()).toBe('https://blockminer.space');
  });

  it('uses APP_URL when it is a well-formed non-localhost https URL', () => {
    stubHostname('some-other-host.example');
    process.env.APP_URL = 'https://blockminer.space/';
    expect(publicSiteOrigin()).toBe('https://blockminer.space');
  });

  it('ignores a localhost APP_URL and falls back to window.location.origin', () => {
    stubHostname('minercore.online');
    process.env.APP_URL = 'http://localhost:3000';
    expect(publicSiteOrigin()).toBe('https://minercore.online');
  });

  it('ignores a malformed (non-http) APP_URL and falls back to window.location.origin', () => {
    stubHostname('minercore.online');
    process.env.APP_URL = 'not-a-url';
    expect(publicSiteOrigin()).toBe('https://minercore.online');
  });
});

describe('nextBlockCountdownAnchor', () => {
  it('creates a fresh anchor when there is no previous one', () => {
    const anchor = nextBlockCountdownAnchor({ blockCountdownSeconds: 100, blockIntervalMinutes: 10 }, null, 1000);
    expect(anchor).toEqual({ fetchedAtMs: 1000, countdownAtFetch: 100, durationSeconds: 600 });
  });

  it('keeps the previous anchor when the server value still matches the local estimate', () => {
    const previous = { fetchedAtMs: 0, countdownAtFetch: 100, durationSeconds: 600 };
    // 5000ms elapsed => locally expected remaining = 95s, server says 94s (within 2s tolerance)
    const anchor = nextBlockCountdownAnchor({ blockCountdownSeconds: 94 }, previous, 5000);
    expect(anchor).toBe(previous);
  });

  it('resyncs when the server value diverges from the local estimate beyond tolerance', () => {
    const previous = { fetchedAtMs: 0, countdownAtFetch: 100, durationSeconds: 600 };
    const anchor = nextBlockCountdownAnchor({ blockCountdownSeconds: 10 }, previous, 5000);
    expect(anchor).toEqual({ fetchedAtMs: 5000, countdownAtFetch: 10, durationSeconds: 600 });
  });

  it('falls back to a 10-minute duration and 0 countdown on a malformed payload', () => {
    const anchor = nextBlockCountdownAnchor({}, null, 0);
    expect(anchor).toEqual({ fetchedAtMs: 0, countdownAtFetch: 0, durationSeconds: 600 });
  });
});

describe('smoothedBlockCountdownSeconds', () => {
  it('returns 0 when there is no anchor yet', () => {
    expect(smoothedBlockCountdownSeconds(null, Date.now())).toBe(0);
  });

  it('never goes negative once the countdown has fully elapsed', () => {
    const anchor = { fetchedAtMs: 0, countdownAtFetch: 5, durationSeconds: 600 };
    expect(smoothedBlockCountdownSeconds(anchor, 999_999)).toBe(0);
  });

  it('linearly decreases with elapsed time', () => {
    const anchor = { fetchedAtMs: 0, countdownAtFetch: 100, durationSeconds: 600 };
    expect(smoothedBlockCountdownSeconds(anchor, 10_000)).toBe(90);
  });
});

describe('pendingPolAccrual', () => {
  it('returns 0 progress at the very start of a block', () => {
    const value = pendingPolAccrual({
      networkHashRate: 100,
      userHashRate: 10,
      blockRewardPol: 50,
      countdownSeconds: 600,
      blockDurationSeconds: 600,
    });
    expect(value).toBe(0);
  });

  it('gives the user their full share once the countdown reaches 0', () => {
    const value = pendingPolAccrual({
      networkHashRate: 100,
      userHashRate: 10,
      blockRewardPol: 50,
      countdownSeconds: 0,
      blockDurationSeconds: 600,
    });
    expect(value).toBeCloseTo(5, 6);
  });

  it('treats a lone miner (0 network hashrate, positive user hashrate) as 100% share', () => {
    const value = pendingPolAccrual({
      networkHashRate: 0,
      userHashRate: 10,
      blockRewardPol: 50,
      countdownSeconds: 0,
      blockDurationSeconds: 600,
    });
    expect(value).toBeCloseTo(50, 6);
  });

  it('returns 0 share when both hashrates are 0 (no divide-by-zero NaN)', () => {
    const value = pendingPolAccrual({
      networkHashRate: 0,
      userHashRate: 0,
      blockRewardPol: 50,
      countdownSeconds: 0,
      blockDurationSeconds: 600,
    });
    expect(value).toBe(0);
  });

  it('clamps progress to [0,1] when countdown exceeds block duration (stale data)', () => {
    const value = pendingPolAccrual({
      networkHashRate: 100,
      userHashRate: 100,
      blockRewardPol: 10,
      countdownSeconds: 5000,
      blockDurationSeconds: 600,
    });
    expect(value).toBe(0);
  });
});
