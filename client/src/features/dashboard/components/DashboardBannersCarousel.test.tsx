import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act, waitFor, fireEvent } from '@testing-library/react';

const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
vi.mock('../../../shared/auth/auth.store', () => ({ api }));

async function mount() {
  const { default: DashboardBannersCarousel } = await import('./DashboardBannersCarousel');
  return render(<DashboardBannersCarousel />);
}

function fourBanners(extra: Partial<Record<string, unknown>> = {}) {
  return [
    { id: 1, title: 'Promo A', imageUrl: '/uploads/a.png', ...extra },
    { id: 2, title: 'Promo B', imageUrl: '/uploads/b.mp4' },
    { id: 3, title: 'Promo C' },
    { id: 4, title: 'Promo D' },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DashboardBannersCarousel', () => {
  it('renders nothing when the API call fails, instead of crashing the dashboard', async () => {
    api.get.mockRejectedValue(new Error('banners service down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = await act(async () => mount());
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
    const codes = errorSpy.mock.calls.filter((c) => c[0] === '[dashboard]').map((c) => (c[1] as { code?: string })?.code);
    expect(codes).toContain('DASHBOARD_BANNERS_FETCH_FAILED');
  });

  it('renders nothing when the API returns ok:false', async () => {
    api.get.mockResolvedValue({ data: { ok: false } });
    const { container } = await act(async () => mount());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing when banners is not an array (malformed payload)', async () => {
    api.get.mockResolvedValue({ data: { ok: true, banners: 'not-an-array' } });
    const { container } = await act(async () => mount());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders a slide for each banner on a well-formed payload', async () => {
    api.get.mockResolvedValue({
      data: {
        ok: true,
        banners: [{ id: 1, title: 'Promo A' }, { id: 2, title: 'Promo B' }],
      },
    });
    await act(async () => mount());
    await waitFor(() => {
      expect(screen.getByText('Promo A')).toBeInTheDocument();
      expect(screen.getByText('Promo B')).toBeInTheDocument();
    });
  });

  it('advances one slide on next and reflects the new position via the active dot', async () => {
    api.get.mockResolvedValue({ data: { ok: true, banners: fourBanners() } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Promo C')).toBeInTheDocument());

    // 4 banners, default visibleCount 3 (jsdom has no ResizeObserver) -> maxIndex 1, 2 dots.
    expect(screen.getByRole('button', { name: 'Ir para o slide 1' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('button', { name: 'Ir para o slide 2' })).toHaveAttribute('aria-current', 'true');
  });

  it('wraps from the last slide back to the first on next, and from the first back to the last on prev', async () => {
    api.get.mockResolvedValue({ data: { ok: true, banners: fourBanners() } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Promo C')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('button', { name: 'Ir para o slide 2' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByRole('button', { name: 'Ir para o slide 1' })).toHaveAttribute('aria-current', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByRole('button', { name: 'Ir para o slide 2' })).toHaveAttribute('aria-current', 'true');
  });

  it('jumps directly to the clicked dot', async () => {
    api.get.mockResolvedValue({ data: { ok: true, banners: fourBanners() } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Promo C')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Ir para o slide 2' }));
    expect(screen.getByRole('button', { name: 'Ir para o slide 2' })).toHaveAttribute('aria-current', 'true');
  });

  it('does not render prev/next arrows or dots when all banners already fit on screen', async () => {
    api.get.mockResolvedValue({
      data: { ok: true, banners: [{ id: 1, title: 'Promo A' }, { id: 2, title: 'Promo B' }] },
    });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Promo B')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Próximo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ir para o slide/ })).not.toBeInTheDocument();
  });

  it('opens the detail modal on slide click and closes it on Escape and on the close button', async () => {
    api.get.mockResolvedValue({
      data: {
        ok: true,
        banners: [{ id: 1, title: 'Promo A', message: 'Details here', link: 'https://example.com', endsAt: new Date(Date.now() + 60_000).toISOString() }],
      },
    });
    await act(async () => mount());
    const slide = await screen.findByText('Promo A');
    fireEvent.click(slide.closest('button')!);

    expect(await screen.findByText('Details here')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('Details here')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('Promo A').closest('button')!);
    const closeBtn = await screen.findByText('Fechar');
    fireEvent.click(closeBtn);
    await waitFor(() => expect(screen.queryByText('Details here')).not.toBeInTheDocument());
  });

  it('normalizes a bare "uploads/..." media path (no leading slash) to an absolute URL', async () => {
    api.get.mockResolvedValue({
      data: { ok: true, banners: [{ id: 1, title: 'Bare Path Promo', imageUrl: 'uploads/a.png' }] },
    });
    await act(async () => mount());
    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', '/uploads/a.png');
  });

  it('falls back to the title placeholder when the banner image fails to load', async () => {
    api.get.mockResolvedValue({
      data: { ok: true, banners: [{ id: 1, title: 'Promo A', imageUrl: '/uploads/broken.png' }] },
    });
    await act(async () => mount());
    const img = await screen.findByRole('img');
    fireEvent.error(img);
    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
  });

  it('falls back to the title placeholder when a video banner fails to load', async () => {
    api.get.mockResolvedValue({
      data: { ok: true, banners: [{ id: 1, title: 'Promo Video', imageUrl: '/uploads/broken.mp4' }] },
    });
    const { container } = await act(async () => mount());
    const video = container.querySelector('video');
    expect(video).toBeInTheDocument();
    fireEvent.error(video!);
    await waitFor(() => expect(container.querySelector('video')).not.toBeInTheDocument());
    expect(screen.getByText('Promo Video')).toBeInTheDocument();
  });

  it('gives the close button full width in the detail modal when the banner has no link', async () => {
    api.get.mockResolvedValue({
      data: { ok: true, banners: [{ id: 1, title: 'No Link Promo' }] },
    });
    await act(async () => mount());
    fireEvent.click(screen.getByText('No Link Promo').closest('button')!);
    const closeBtn = await screen.findByText('Fechar');
    expect(closeBtn).toHaveClass('flex-1');
  });

  it('shrinks the close button to make room for the link CTA when the banner has a link', async () => {
    api.get.mockResolvedValue({
      data: { ok: true, banners: [{ id: 1, title: 'Linked Promo', link: 'https://example.com' }] },
    });
    await act(async () => mount());
    fireEvent.click(screen.getByText('Linked Promo').closest('button')!);
    const closeBtn = await screen.findByText('Fechar');
    expect(closeBtn).not.toHaveClass('flex-1');
    expect(screen.getByText('Saiba mais').closest('a')).toHaveAttribute('href', 'https://example.com');
  });

  it('shows the media and the countdown badge inside the detail modal when the banner has an image and endsAt', async () => {
    api.get.mockResolvedValue({
      data: {
        ok: true,
        banners: [
          { id: 1, title: 'Media Promo', imageUrl: '/uploads/promo.png', endsAt: new Date(Date.now() + 60_000).toISOString() },
        ],
      },
    });
    const { container } = await act(async () => mount());
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => expect(screen.getByText('Fechar')).toBeInTheDocument());
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TERMINA EM').length).toBeGreaterThan(0);
  });

  it('shows the video and the countdown badge inside the detail modal when the banner has a video and endsAt', async () => {
    api.get.mockResolvedValue({
      data: {
        ok: true,
        banners: [
          { id: 1, title: 'Video Promo', imageUrl: '/uploads/promo.mp4', endsAt: new Date(Date.now() + 60_000).toISOString() },
        ],
      },
    });
    const { container } = await act(async () => mount());
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => expect(screen.getByText('Fechar')).toBeInTheDocument());
    expect(document.querySelector('.relative.w-full.aspect-video video')).toBeInTheDocument();
  });

  it('opens an internal (non-http) banner link in the same tab instead of a new one', async () => {
    api.get.mockResolvedValue({
      data: { ok: true, banners: [{ id: 1, title: 'Internal Promo', link: '/shop' }] },
    });
    await act(async () => mount());
    fireEvent.click(screen.getByText('Internal Promo').closest('button')!);
    const link = await screen.findByText('Saiba mais');
    expect(link.closest('a')).toHaveAttribute('target', '_self');
  });

  it('formats a multi-day countdown as "Xd : Yh : Zm"', async () => {
    const endsAt = new Date(Date.now() + 2 * 86_400_000 + 3 * 3_600_000 + 5 * 60_000).toISOString();
    api.get.mockResolvedValue({ data: { ok: true, banners: [{ id: 1, title: 'Long Promo', endsAt }] } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText(/\dd : \dh : \dm/)).toBeInTheDocument());
  });

  it('shows the countdown badge under the title (not over the media) when the banner has no image', async () => {
    const endsAt = new Date(Date.now() + 5 * 60_000).toISOString();
    api.get.mockResolvedValue({ data: { ok: true, banners: [{ id: 1, title: 'Textual Promo', endsAt }] } });
    await act(async () => mount());
    fireEvent.click(screen.getByText('Textual Promo').closest('button')!);
    await waitFor(() => expect(screen.getByText('Fechar')).toBeInTheDocument());
    expect(screen.getAllByText(/TERMINA EM/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('disconnects the ResizeObserver on unmount', async () => {
    const disconnect = vi.fn();
    class FakeResizeObserver {
      observe = vi.fn();
      disconnect = disconnect;
      unobserve = vi.fn();
      constructor(_cb: ResizeObserverCallback) {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    api.get.mockResolvedValue({ data: { ok: true, banners: fourBanners() } });
    const { unmount } = await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Promo C')).toBeInTheDocument());
    unmount();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it.each([
    [850, true],
    [1100, true],
    [1400, false],
  ])('at a container width of %ipx, nav arrows show only when %s (4 banners need > visibleCount)', async (width, arrowsExpected) => {
    let observedCallback: ResizeObserverCallback | null = null;
    class FakeResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        observedCallback = cb;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    api.get.mockResolvedValue({ data: { ok: true, banners: fourBanners() } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Promo C')).toBeInTheDocument());
    act(() => {
      observedCallback!([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    if (arrowsExpected) {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Próximo' })).toBeInTheDocument());
    } else {
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Próximo' })).not.toBeInTheDocument());
    }
    vi.unstubAllGlobals();
  });

  it('recomputes the visible column count from the container width via ResizeObserver', async () => {
    let observedCallback: ResizeObserverCallback | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class FakeResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        observedCallback = cb;
      }
      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);

    api.get.mockResolvedValue({ data: { ok: true, banners: fourBanners() } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Promo C')).toBeInTheDocument());
    expect(observe).toHaveBeenCalled();

    act(() => {
      observedCallback!([{ contentRect: { width: 300 } } as ResizeObserverEntry], {} as ResizeObserver);
    });
    // width < 640 -> visibleCount 1 -> all 4 banners now overflow -> 4 dots instead of 2.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ir para o slide 4' })).toBeInTheDocument());

    vi.unstubAllGlobals();
  });
});
