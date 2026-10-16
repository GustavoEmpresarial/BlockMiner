import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import YoutubeBackgroundRunner from './YoutubeBackgroundRunner';
import { YT_LAST_VIDEO_KEY, resetYoutubePageLease } from '../lib/youtubeBackground';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  mockPowerBoost: { value: false },
  mockPageActive: { value: false },
}));

vi.mock('../../../shared/auth/auth.store', () => ({
  api: mocks.api,
}));

vi.mock('../../../shared/hooks/usePowerBoostActive', () => ({
  usePowerBoostActive: () => mocks.mockPowerBoost.value,
}));

vi.mock('../lib/youtubeBackground', async () => {
  const actual = await vi.importActual<typeof import('../lib/youtubeBackground')>('../lib/youtubeBackground');
  return {
    ...actual,
    useYoutubePageActive: () => mocks.mockPageActive.value,
  };
});

describe('YoutubeBackgroundRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.mockPowerBoost.value = false;
    mocks.mockPageActive.value = false;
    mocks.api.post.mockReset();
    mocks.api.post.mockResolvedValue({ data: { ok: true, rewardGh: 10 } });
    localStorage.clear();
    sessionStorage.clear();
    resetYoutubePageLease();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does nothing when Power Boost is inactive', async () => {
    mocks.mockPowerBoost.value = false;
    mocks.mockPageActive.value = false;
    localStorage.setItem(YT_LAST_VIDEO_KEY, 'dQw4w9WgXcQ');

    render(<YoutubeBackgroundRunner />);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('stands down when the user is on the YouTube watch page (pageActive is true)', async () => {
    mocks.mockPowerBoost.value = true;
    mocks.mockPageActive.value = true;
    localStorage.setItem(YT_LAST_VIDEO_KEY, 'dQw4w9WgXcQ');

    render(<YoutubeBackgroundRunner />);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.api.post).not.toHaveBeenCalled();
  });

  it('does not send heartbeats or claims off-page (ghost mining disabled)', async () => {
    mocks.mockPowerBoost.value = true;
    mocks.mockPageActive.value = false;
    localStorage.setItem(YT_LAST_VIDEO_KEY, 'dQw4w9WgXcQ');

    render(<YoutubeBackgroundRunner />);

    await vi.advanceTimersByTimeAsync(65_000);
    expect(mocks.api.post).not.toHaveBeenCalled();
  });
});
