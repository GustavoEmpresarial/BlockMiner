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

  it('shows prev/next arrows and dot navigation once banners exceed the visible count, and wraps around on click', async () => {
    api.get.mockResolvedValue({ data: { ok: true, banners: fourBanners() } });
    await act(async () => mount());
    await waitFor(() => expect(screen.getByText('Promo C')).toBeInTheDocument());

    const [prevBtn, nextBtn] = screen.getAllByRole('button').filter((b) => !b.textContent);
    expect(prevBtn).toBeInTheDocument();
    expect(nextBtn).toBeInTheDocument();

    fireEvent.click(prevBtn);
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);
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

  it('falls back to the title placeholder when the banner image fails to load', async () => {
    api.get.mockResolvedValue({
      data: { ok: true, banners: [{ id: 1, title: 'Promo A', imageUrl: '/uploads/broken.png' }] },
    });
    await act(async () => mount());
    const img = await screen.findByRole('img');
    fireEvent.error(img);
    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
  });
});
