import { describe, expect, it, vi, afterEach } from 'vitest';
import { probeUserscriptManagersInstalled } from './integrity.managers';

describe('probeUserscriptManagersInstalled', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not create Image probes by default (avoids chrome-extension ERR_FAILED spam)', async () => {
    const ImageMock = vi.fn(function ImageMock(this: { src: string }) {
      this.src = '';
    });
    vi.stubGlobal('Image', ImageMock);
    vi.stubGlobal('window', globalThis);

    const ids = await probeUserscriptManagersInstalled(50);
    expect(ids).toEqual([]);
    expect(ImageMock).not.toHaveBeenCalled();
  });

  it('opt-in WAR may construct Image', async () => {
    const ImageMock = vi.fn(function ImageMock(this: {
      src: string;
      onload: null | (() => void);
      onerror: null | (() => void);
    }) {
      this.src = '';
      this.onload = null;
      this.onerror = null;
      queueMicrotask(() => this.onerror?.());
    });
    vi.stubGlobal('Image', ImageMock);
    vi.stubGlobal('window', globalThis);

    await probeUserscriptManagersInstalled(50, { includeWar: true });
    expect(ImageMock.mock.calls.length).toBeGreaterThan(0);
  });
});
