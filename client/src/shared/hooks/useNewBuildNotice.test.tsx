import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

const { toastFn, dismiss, forceReload } = vi.hoisted(() => ({ toastFn: vi.fn(), dismiss: vi.fn(), forceReload: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign((...a: unknown[]) => toastFn(...a), { dismiss }) }));
vi.mock('../utils/chunkLoadError', async (orig) => ({
  ...(await orig<typeof import('../utils/chunkLoadError')>()),
  forceReloadForNewBuild: () => forceReload(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { useNewBuildNotice, NEW_BUILD_POLL_MS } from './useNewBuildNotice';

let serverBuild = 'b1';
let fetchCalls = 0;
function htmlFor(id: string) {
  return `<!doctype html><html><head><meta name="bm-build" content="${id}" /></head></html>`;
}

let go: (p: string) => void = () => {};
function Harness() {
  useNewBuildNotice();
  const navigate = useNavigate();
  go = (p) => navigate(p);
  return null;
}

async function flush() {
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  serverBuild = 'b1';
  fetchCalls = 0;
  document.head.innerHTML = '<meta name="bm-build" content="b1" />';
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => {
    fetchCalls += 1;
    return new Response(htmlFor(serverBuild), { status: 200, headers: { 'content-type': 'text/html' } });
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  toastFn.mockReset();
  dismiss.mockReset();
  forceReload.mockReset();
});

describe('useNewBuildNotice', () => {
  it('stays quiet while the server serves the same build', async () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><Harness /></MemoryRouter>);
    await act(async () => { vi.advanceTimersByTime(NEW_BUILD_POLL_MS * 2); });
    await flush();
    expect(fetchCalls).toBeGreaterThanOrEqual(2);
    expect(toastFn).not.toHaveBeenCalled();
    go('/shop');
    await flush();
    expect(forceReload).not.toHaveBeenCalled();
  });

  it('shows a reload notice once a new build is deployed, then reloads on the next page change', async () => {
    render(<MemoryRouter initialEntries={['/youtube']}><Harness /></MemoryRouter>);
    await flush();
    serverBuild = 'b2';
    await act(async () => { vi.advanceTimersByTime(NEW_BUILD_POLL_MS); });
    await flush();
    expect(toastFn).toHaveBeenCalledTimes(1);
    const [msg, opts] = toastFn.mock.calls[0] as [string, { action: { label: string; onClick: () => void }; duration: number }];
    expect(msg).toBe('shell.new_version_message');
    expect(opts.action.label).toBe('shell.new_version_reload');
    expect(opts.duration).toBe(Infinity);
    // Not while the player is still on the page they were using.
    expect(forceReload).not.toHaveBeenCalled();
    // Stops polling once known.
    const calls = fetchCalls;
    await act(async () => { vi.advanceTimersByTime(NEW_BUILD_POLL_MS * 3); });
    expect(fetchCalls).toBe(calls);
    go('/shop');
    await flush();
    expect(forceReload).toHaveBeenCalledTimes(1);
  });

  it('the notice button reloads right away', async () => {
    serverBuild = 'b2';
    render(<MemoryRouter><Harness /></MemoryRouter>);
    await act(async () => { vi.advanceTimersByTime(NEW_BUILD_POLL_MS); });
    await flush();
    const opts = toastFn.mock.calls[0][1] as { action: { onClick: () => void } };
    opts.action.onClick();
    expect(forceReload).toHaveBeenCalledTimes(1);
  });

  it('never reloads on an error page or a failed fetch (only on a confirmed new build)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad gateway', { status: 502, headers: { 'content-type': 'text/html' } })));
    render(<MemoryRouter><Harness /></MemoryRouter>);
    await act(async () => { vi.advanceTimersByTime(NEW_BUILD_POLL_MS * 2); });
    await flush();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await act(async () => { vi.advanceTimersByTime(NEW_BUILD_POLL_MS); });
    await flush();
    expect(toastFn).not.toHaveBeenCalled();
    go('/shop');
    await flush();
    expect(forceReload).not.toHaveBeenCalled();
  });

  it('reloads on navigation at most once per build, so a stale cached shell cannot loop', async () => {
    serverBuild = 'b2';
    sessionStorage.setItem('blockminer:new-build-nav-reload', 'b2');
    render(<MemoryRouter initialEntries={['/a']}><Harness /></MemoryRouter>);
    await act(async () => { vi.advanceTimersByTime(NEW_BUILD_POLL_MS); });
    await flush();
    go('/b');
    await flush();
    expect(forceReload).not.toHaveBeenCalled();
    expect(toastFn).toHaveBeenCalledTimes(1);
  });
});
