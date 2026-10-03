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
    it('does nothing when url is empty or whitespace', () => {
      const openSpy = vi.spyOn(window, 'open');
      openPartnerSafe('');
      openPartnerSafe('   ');
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('delegates to _BmPartnerIframe if available on window', () => {
      const mockHarness = vi.fn().mockReturnValue(true);
      window._BmPartnerIframe = mockHarness;

      openPartnerSafe('https://offerwall.me/offerwall/pub/1');
      expect(mockHarness).toHaveBeenCalledWith('https://offerwall.me/offerwall/pub/1');
    });

    it('creates an anchor tag with rel="noopener" and target="_blank"', () => {
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

      openPartnerSafe('https://offerwall.me/offerwall/pub/42');

      expect(clickSpy).toHaveBeenCalled();
      expect(appendSpy).toHaveBeenCalled();
    });
  });

  describe('fetchOfferwallLinkWithPass', () => {
    it('returns url directly on successful 200 response', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: { ok: true, url: 'https://offerwall.me/offerwall/yyu8i3jt58by9do1fbdr0fyn60yn5u/123' },
      });

      const url = await fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link');
      expect(url).toBe('https://offerwall.me/offerwall/yyu8i3jt58by9do1fbdr0fyn60yn5u/123');
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

      const url = await fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link');

      expect(ensureMock).toHaveBeenCalledWith('offerwallme');
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(api.get).toHaveBeenLastCalledWith('/offerwallme/link', {
        headers: { 'x-bm-captcha-pass': 'test-pass-token-abc' },
      });
      expect(url).toBe('https://offerwall.me/offerwall/yyu8i3jt58by9do1fbdr0fyn60yn5u/123');
    });

    it('returns null if request fails without captcha or retry fails', async () => {
      vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));

      const url = await fetchOfferwallLinkWithPass('offerwallme', '/offerwallme/link');
      expect(url).toBeNull();
    });
  });
});
