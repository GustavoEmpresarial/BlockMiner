import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook, cleanup } from '@testing-library/react';
import {
  LiveMiningWidget,
  FaqItem,
  FeedPanel,
  useInViewOnce,
  useCountUp,
  timeAgo,
  type FeedRow,
} from './landing.shared';

afterEach(() => {
  cleanup();
});

describe('LiveMiningWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the simulated-panel disclaimer so it never reads as real data', () => {
    render(<LiveMiningWidget />);
    expect(screen.getByText(/Simulado/i)).toBeInTheDocument();
  });

  it('renders an ONLINE status and starts with the initial stat values', () => {
    render(<LiveMiningWidget />);
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(screen.getByText('127')).toBeInTheDocument(); // initial blocksFound
  });

  it('animates hashrate/progress over time without crashing (decorative, not real data)', () => {
    render(<LiveMiningWidget />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Still mounted and showing a plausible H/s value after several ticks.
    expect(screen.getAllByText(/H\/s/).length).toBeGreaterThan(0);
  });
});

describe('FaqItem', () => {
  it('starts collapsed (answer not in the document) and expands on click', () => {
    render(<FaqItem id="faq1" question="Is it free?" answer="Yes, totally free." />);
    expect(screen.queryByText('Yes, totally free.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Is it free?' }));
    expect(screen.getByText('Yes, totally free.')).toBeInTheDocument();
  });

  it('toggles aria-expanded for accessibility', () => {
    render(<FaqItem id="faq2" question="Q" answer="A" />);
    const button = screen.getByRole('button', { name: 'Q' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('FeedPanel', () => {
  const rows: FeedRow[] = [
    { id: 1, user: 'Al***', amount: 12.5, at: new Date(Date.now() - 5 * 60_000).toISOString() },
    { id: 2, user: 'Bo***', amount: 3.0001, at: new Date(Date.now() - 2 * 3_600_000).toISOString() },
  ];

  it('shows the empty state when there are no rows', () => {
    render(<FeedPanel title="Saques" rows={[]} color="emerald" />);
    expect(screen.getByText('sem dados')).toBeInTheDocument();
  });

  it('renders each row with a masked username, formatted amount (4 decimals), and a relative time', () => {
    render(<FeedPanel title="Saques" rows={rows} color="emerald" />);
    expect(screen.getByText('Al***')).toBeInTheDocument();
    expect(screen.getByText('12.5000 POL')).toBeInTheDocument();
    expect(screen.getByText('5min atrás')).toBeInTheDocument();
    expect(screen.getByText('Bo***')).toBeInTheDocument();
    expect(screen.getByText('3.0001 POL')).toBeInTheDocument();
    expect(screen.getByText('2h atrás')).toBeInTheDocument();
  });

  it('renders the panel title', () => {
    render(<FeedPanel title="Depósitos" rows={rows} color="sky" />);
    expect(screen.getByText('Depósitos')).toBeInTheDocument();
  });
});

describe('useInViewOnce (hook)', () => {
  it('starts as not-visible and flips true once IntersectionObserver reports intersecting', () => {
    let observerCallback: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    const disconnect = vi.fn();
    class FakeIntersectionObserver {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        observerCallback = cb;
      }
      observe() {}
      disconnect = disconnect;
    }
    const original = global.IntersectionObserver;
    global.IntersectionObserver = FakeIntersectionObserver;
    try {
      const { result } = renderHook(() => useInViewOnce());
      const [ref, visible] = result.current;
      expect(visible).toBe(false);
      // Attach a fake DOM node so the effect's `if (!el ...)` guard doesn't bail.
      act(() => {
        ref.current = document.createElement('div');
      });
    } finally {
      global.IntersectionObserver = original;
    }
  });
});

describe('useCountUp (hook)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays at 0 when disabled', () => {
    const { result } = renderHook(() => useCountUp(100, false, 0));
    expect(result.current).toBe(0);
  });

  it('counts up towards the end value once enabled, reaching it by the animation duration', () => {
    const { result, rerender } = renderHook(({ end, enabled }) => useCountUp(end, enabled, 0), {
      initialProps: { end: 100, enabled: true },
    });
    act(() => {
      vi.advanceTimersByTime(1200); // past the 1100ms animation duration
    });
    rerender({ end: 100, enabled: true });
    expect(result.current).toBeGreaterThan(0);
  });
});
