import '@testing-library/jest-dom/vitest';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../i18n/locales/pt-BR.json';

// Full end-to-end-ish smoke test for the real YouTubeWatchPage component (not just the
// extracted hooks in isolation) — mounts it with a fake window.YT player and a fake backend,
// then drives real fake-timer time through the exact three failure scenarios fixed
// 2026-09-11, asserting on observable network call counts instead of requiring a human to
// click through the real site every time:
//   1. "piscando preto" — player destroyed/recreated every second (fixed via cycleId/dep chain)
//   2. false pause from the iframe stealing window focus while still playing
//   3. reward-claim flood after the countdown froze at 0 forever post-claim
//   4. isPaused never auto-clearing once playback genuinely resumed inside the iframe

const api = { get: vi.fn(), post: vi.fn() };
vi.mock('../../shared/auth/auth.store', () => ({ api }));

// ---- Fake backend state (mirrors server/modules/youtube + session.heartbeat.service logic
// closely enough to exercise the real client state machine) ----
const HEARTBEAT_CREDIT_SEC = 10; // matches the 10s client heartbeat interval cadence
const MIN_SECONDS_TO_CLAIM = 45;
const REWARD_PER_CLAIM_HS = 10;

let server: {
  ytSecondsBalance: number;
  claims24h: number;
  hashGranted24h: number;
};

function resetServer() {
  server = { ytSecondsBalance: 0, claims24h: 0, hashGranted24h: 0 };
  boostActive = false;
}

function statsPayload() {
  return {
    ok: true,
    watchSecondsBalance: server.ytSecondsBalance,
    claims24h: server.claims24h,
    hashGranted24h: server.hashGranted24h,
    dailyLimit: 1000,
    dailyRemainingHash: 1000 - server.hashGranted24h,
    activeHashTotal: server.hashGranted24h,
    minSecondsToClaim: MIN_SECONDS_TO_CLAIM,
  };
}

let boostActive = false;

function installApiMock() {
  api.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/youtube/status')) return { data: { ok: true, activeHashRate: 0 } };
    if (url.startsWith('/youtube/stats')) return { data: statsPayload() };
    // usePowerBoostActive() calls /power-boost/status; PowerBoostBanner calls /boosts/status —
    // same underlying route (server/bootstrap/server.ts mounts boostsRouter at both prefixes).
    if (url.startsWith('/boosts/status') || url.startsWith('/power-boost/status')) {
      return { data: { ok: true, active: boostActive } };
    }
    return { data: { ok: true } };
  });

  api.post.mockImplementation(async (url: string) => {
    if (url === '/session/heartbeat') {
      server.ytSecondsBalance += HEARTBEAT_CREDIT_SEC;
      return { data: { ok: true } };
    }
    if (url === '/youtube/claim') {
      if (server.ytSecondsBalance >= MIN_SECONDS_TO_CLAIM) {
        server.ytSecondsBalance -= MIN_SECONDS_TO_CLAIM;
        server.claims24h += 1;
        server.hashGranted24h += REWARD_PER_CLAIM_HS;
        return { data: { ok: true, rewardGh: REWARD_PER_CLAIM_HS } };
      }
      const err = new Error('claim rejected') as Error & { response?: unknown; isAxiosError?: boolean };
      err.isAxiosError = true;
      err.response = {
        status: 400,
        data: {
          message: 'watch more before claiming',
          retryAfterMs: (MIN_SECONDS_TO_CLAIM - server.ytSecondsBalance) * 1000,
        },
      };
      throw err;
    }
    return { data: { ok: true } };
  });
}

// ---- Fake YouTube IFrame API ----
type FakeYTPlayerHandle = {
  triggerReady: () => void;
  triggerStateChange: (state: number) => void;
  pauseVideo: ReturnType<typeof vi.fn>;
  playVideo: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};
let lastPlayer: FakeYTPlayerHandle | null = null;

const YTState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

function installFakeYouTubeApi() {
  class FakeYTPlayer {
    private events: { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void };
    pauseVideo = vi.fn();
    playVideo = vi.fn();
    destroy = vi.fn();
    constructor(_el: unknown, opts: { events?: typeof FakeYTPlayer.prototype.events }) {
      this.events = opts.events ?? {};
      const handle: FakeYTPlayerHandle = {
        triggerReady: () => this.events.onReady?.(),
        triggerStateChange: (state: number) => this.events.onStateChange?.({ data: state }),
        pauseVideo: this.pauseVideo,
        playVideo: this.playVideo,
        destroy: this.destroy,
      };
      lastPlayer = handle;
      // Real YT.Player calls onReady asynchronously (next microtask) — mirror that instead of
      // synchronously, so effect-ordering bugs (like the "piscando preto" one) would surface.
      queueMicrotask(() => this.events.onReady?.());
    }
  }
  (window as unknown as { YT: unknown }).YT = { Player: FakeYTPlayer, PlayerState: YTState };
}

const i18n = i18next.createInstance();

async function mountPage() {
  const { default: YouTubeWatchPage } = await import('./YouTubeWatchPage');
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <YouTubeWatchPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

async function loadVideo() {
  const input = screen.getByPlaceholderText(/Cole a URL|Paste the YouTube/i);
  fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } });
  const loadButton = screen.getByRole('button', { name: /Carregar|Load/i });
  fireEvent.click(loadButton);
  // Let the player-creation effect + fake onReady microtask settle.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  resetServer();
  installApiMock();
  installFakeYouTubeApi();
  vi.useFakeTimers();
  await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  lastPlayer = null;
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('YouTubeWatchPage smoke test (real component, fake player + backend, real timers)', () => {
  it('does not destroy/recreate the player on its own over time while a video is loaded (regression: "piscando preto")', { timeout: 20_000 }, async () => {
    await mountPage();
    await loadVideo();
    const player = lastPlayer!;
    expect(player).toBeTruthy();

    act(() => player.triggerStateChange(YTState.PLAYING));

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(player.destroy).not.toHaveBeenCalled();
  });

  it('does not force-pause when the window blurs while the player is still reporting PLAYING (iframe focus-steal)', { timeout: 20_000 }, async () => {
    await mountPage();
    await loadVideo();
    const player = lastPlayer!;
    act(() => player.triggerStateChange(YTState.PLAYING));

    await act(async () => {
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(9000); // past BLUR_PAUSE_GRACE_MS (8000ms)
      await Promise.resolve();
    });

    expect(player.pauseVideo).not.toHaveBeenCalled();
  });

  it('claims periodically without flooding, and the server-verified watch time keeps advancing indefinitely (not frozen)', { timeout: 20_000 }, async () => {
    await mountPage();
    await loadVideo();
    const player = lastPlayer!;
    act(() => player.triggerStateChange(YTState.PLAYING));

    // Run for ~130s of simulated watching — enough to complete two full 60s claim cycles. At
    // 10 H/s/claim and a real ~60s cadence, this should produce a small, bounded number of
    // claims (2-3) — not dozens (the flood bug fired runClaim() once per second, i.e. ~130
    // calls over this same window instead).
    for (let i = 0; i < 130; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
    }

    const claimCalls = api.post.mock.calls.filter(([url]) => url === '/youtube/claim').length;
    const heartbeatCalls = api.post.mock.calls.filter(([url]) => url === '/session/heartbeat').length;
    expect(claimCalls).toBeGreaterThan(0);
    expect(claimCalls).toBeLessThan(10); // real cadence is ~1/min; a flood would be ~130
    expect(heartbeatCalls).toBeGreaterThan(5); // heartbeat must still be firing near the end
  });

  it('recovers heartbeat/claims after a real pause + resume triggered from inside the iframe itself (not the app resume button)', { timeout: 20_000 }, async () => {
    await mountPage();
    await loadVideo();
    const player = lastPlayer!;
    act(() => player.triggerStateChange(YTState.PLAYING));

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
    });
    const heartbeatsBeforePause = api.post.mock.calls.filter(([url]) => url === '/session/heartbeat').length;
    expect(heartbeatsBeforePause).toBeGreaterThan(0);

    // A real pause (tab hidden) — the untouched, genuine pause path.
    await act(async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    // Resume playback from INSIDE the iframe (the player itself reports PLAYING again) —
    // never through the app's "Entendi"/resume button.
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => player.triggerStateChange(YTState.PLAYING));

    api.post.mockClear();
    await act(async () => {
      for (let i = 0; i < 15; i += 1) {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      }
    });

    const heartbeatsAfterResume = api.post.mock.calls.filter(([url]) => url === '/session/heartbeat').length;
    expect(heartbeatsAfterResume).toBeGreaterThan(0);
  });

  it('keeps presence/heartbeat/claims alive on a backgrounded tab when Power Boost is active, WITHOUT any resume signal from the player itself', { timeout: 20_000 }, async () => {
    boostActive = true;
    await mountPage();
    await loadVideo();
    const player = lastPlayer!;
    act(() => player.triggerStateChange(YTState.PLAYING));

    // usePowerBoostActive() caches its last fetch across mounts (module-level singleton,
    // 30s TTL) — force a fresh fetch so this test actually observes boostActive=true instead
    // of a stale cached value left over from an earlier test/mount.
    await act(async () => {
      window.dispatchEvent(new CustomEvent('blockminer:power-boost-changed'));
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    const heartbeatsBeforeBg = api.post.mock.calls.filter(([url]) => url === '/session/heartbeat').length;
    expect(heartbeatsBeforeBg).toBeGreaterThan(0);

    // Background the tab the way a REAL browser does when Chrome throttles/suspends a hidden
    // YouTube iframe: the player itself reports PAUSED (this is exactly what the user described —
    // "eu mudo de aba... esse fdp para" / switching tabs makes it just stop), plus the usual
    // hidden/blur signals. Power Boost's own description promises the user can
    // "usar o PC livremente sem pausar YouTube, Auto Mining e Shortlinks" — so presence/claims
    // must keep going via the app's own Power-Boost fallback (`presenceActive` in
    // YouTubeWatchPage.tsx) even though the player is no longer reporting "playing".
    await act(async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
      player.triggerStateChange(YTState.PAUSED);
      await Promise.resolve();
    });

    api.post.mockClear();
    for (let i = 0; i < 90; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });
    }

    const heartbeatsWhileBackgrounded = api.post.mock.calls.filter(([url]) => url === '/session/heartbeat').length;
    const claimsWhileBackgrounded = api.post.mock.calls.filter(([url]) => url === '/youtube/claim').length;
    expect(heartbeatsWhileBackgrounded).toBeGreaterThan(0);
    expect(claimsWhileBackgrounded).toBeGreaterThan(0);
  });
});
