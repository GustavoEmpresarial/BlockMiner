import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router-dom';
import ScrollToTopOnNav from './ScrollToTopOnNav';

const nav: { current: NavigateFunction | null } = { current: null };
function Grab() {
  const navigate = useNavigate();
  useEffect(() => {
    nav.current = navigate;
  }, [navigate]);
  return <main data-route-scroll />;
}
const navigate = (to: string) => nav.current!(to);

function setup(initial = '/dashboard') {
  render(
    <MemoryRouter initialEntries={[initial]}>
      <ScrollToTopOnNav />
      <Grab />
    </MemoryRouter>,
  );
  return document.querySelector<HTMLElement>('[data-route-scroll]')!;
}

describe('ScrollToTopOnNav', () => {
  let windowScroll: ReturnType<typeof vi.fn>;
  let elScroll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    windowScroll = vi.fn();
    elScroll = vi.fn();
    vi.stubGlobal('scrollTo', windowScroll);
    HTMLElement.prototype.scrollTo = elScroll as unknown as typeof HTMLElement.prototype.scrollTo;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('scrolls window and route scroll containers to the top on every path change', () => {
    setup();
    windowScroll.mockClear();
    elScroll.mockClear();
    act(() => navigate('/shop'));
    expect(windowScroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
    expect(elScroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('leaves hash links alone so anchors still work', () => {
    setup();
    windowScroll.mockClear();
    act(() => navigate('/#how-it-works'));
    expect(windowScroll).not.toHaveBeenCalled();
  });
});
