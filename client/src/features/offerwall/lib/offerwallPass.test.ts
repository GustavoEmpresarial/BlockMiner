import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openPartnerSafe, fetchOfferwallLinkWithPass } from './offerwallPass';
import { api } from '../../../shared/auth/auth.store';

vi.mock('../../../shared/auth/auth.store', () => ({
  api: {
    get: vi.fn(),
  },
}));

describe('offerwallPass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window._BmPartnerIframe;
    delete window.BmCaptchaGate;
  });

  afterEach(() => {
    delete window._BmPartnerIframe;
    delete window.BmCaptchaGate;
  });

  describe('openPartnerSafe', () => {
    it('returns false when url is empty or whitespace', () => {
      const openSpy = vi.spyOn(window, 'open');
      expect(openPartnerSafe('')).toBe(false);
      expect(openPartnerSafe('   ')).toBe(false);
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('delegates to _BmPartnerIframe if available on window and returns its boolean result', () => {
      const mockHarness = vi.fn().mockReturnValue(true);
      window._BmPartnerIframe = mockHarness;

      const result = openPartnerSafe('https://offerwall.me/offerwall/pub/1');
      expect(mockHarness).toHaveBeenCalledWith('https://offerwall.me/offerwall/pub/1');
      expect(result).toBe(true);
    });

    it('returns true when window.open succeeds and returns a window object', () => {
      const fakeWin = { focus: vi.fn() } as unknown as Window;
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWin);

      const result = openPartnerSafe('https://offerwall.me/offerwall/pub/1');
      expect(openSpy).toHaveBeenCalledWith('https://offerwall.me/offerwall/pub/1', '_blank', 'noopener');
      expect(result).toBe(true);
    });

    it('returns false when window.open is blocked and returns null', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

      const result = openPartnerSafe('https://offerwall.me/offerwall/pub/1');
      expect(openSpy).toHaveBeenCalledWith('https://offerwall.me/offerwall/pub/1', '_blank', 'noopener');
      expect(result).toBe(false);
    });

    it('returns false when window.open throws an exception', () => {
      vi.spyOn(window, 'open').mockImplementation(() => {
        throw new Error('Window blocked');
      });

      const result = openPartnerSafe('https://offerwall.me/offerwall/pub/1');
      expect(result).toBe(false);
    });

    it('falls back to programmatic anchor click when window.open is not available', () => {
      const originalOpen = window.open;
      // @ts-expect-error test environment override
      delete window.open;

      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const clickSpy = vi.fn();

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'a') {
          el.click = clickSpy;
        }
        return el;
      });

      const result = openPartnerSafe('https://offerwall.me/offerwall/pub/42');

      expect(clickSpy).toHaveBeenCalled();
      expect(appendSpy).toHaveBeenCalled();
      expect(result).toBe(true);

      window.open = originalOpen;
    });
  });

  describe('fetchOfferwallLinkWithPass', () => {
    it('returns { ok: true, url } directly on successful 200 response', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { ok: true, url: 'https://offerwall.me/offerwall/yyu8i3jt58by9do1fbdr0fyn60yn5u/123' },
      });

      const res = await fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link');
      expect(res).toEqual({
        ok: true,
        url: 'https://offerwall.me/offerwall/yyu8i3jt58by9do1fbdr0fyn60yn5u/123',
      });
      expect(api.get).toHaveBeenCalledWith('/offerwallme/link');
    });

    it('transparently invokes BmCaptchaGate and retries with passToken on 403 CAPTCHA_PASS_REQUIRED', async () => {
      // First attempt fails with 403
      vi.mocked(api.get).mockRejectedValueOnce({
        response: {
          status: 403,
          data: { ok: false, code: 'CAPTCHA_PASS_REQUIRED' },
        },
      });

      // BmCaptchaGate available
      const ensureMock = vi.fn().mockResolvedValue('test-pass-token-abc');
      window.BmCaptchaGate = {
        ensure: ensureMock,
        show: vi.fn(),
        openWithPass: vi.fn(),
      };

      // Second attempt succeeds with header
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { ok: true, url: 'https://offerwall.me/offerwall/yyu8i3jt58by9do1fbdr0fyn60yn5u/123' },
      });

      const res = await fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link');

      expect(ensureMock).toHaveBeenCalledWith('offerwallme');
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(api.get).toHaveBeenLastCalledWith('/offerwallme/link', {
        headers: { 'x-bm-captcha-pass': 'test-pass-token-abc' },
      });
      expect(res).toEqual({
        ok: true,
        url: 'https://offerwall.me/offerwall/yyu8i3jt58by9do1fbdr0fyn60yn5u/123',
      });
    });

    it('returns { ok: false, code: "CAPTCHA_CANCELLED" } if user cancels captcha', async () => {
      vi.mocked(api.get).mockRejectedValueOnce({
        response: {
          status: 403,
          data: { ok: false, code: 'CAPTCHA_PASS_REQUIRED' },
        },
      });

      window.BmCaptchaGate = {
        ensure: vi.fn().mockRejectedValue(new Error('User closed captcha modal')),
        show: vi.fn(),
        openWithPass: vi.fn(),
      };

      const res = await fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link');
      expect(res).toEqual({
        ok: false,
        code: 'CAPTCHA_CANCELLED',
        message: 'Captcha verification cancelled',
      });
    });

    it('returns { ok: false, code: "NETWORK_ERROR" } on connection loss', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));

      const res = await fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link');
      expect(res).toEqual({
        ok: false,
        code: 'NETWORK_ERROR',
        message: 'Network connection failed',
      });
    });

    it('returns { ok: false, code: "UNAUTHENTICATED" } on 401', async () => {
      vi.mocked(api.get).mockRejectedValueOnce({
        response: {
          status: 401,
        },
      });

      const res = await fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link');
      expect(res).toEqual({
        ok: false,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    });
  });
});
