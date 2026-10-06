import { useLayoutEffect, useState, type RefObject } from 'react';

/** Keeps a right-aligned fixed menu inside the viewport. Matches the rack tooltip inset. */
export const ANCHORED_MENU_VIEWPORT_MARGIN_PX = 8;

/** Tailwind `w-80` at the default 16px root. Used until the panel has been measured. */
export const NOTIFICATION_PANEL_WIDTH_PX = 320;

/** Tailwind `w-40` at the default 16px root. Used until the menu has been measured. */
export const LANGUAGE_MENU_WIDTH_PX = 160;

export type AnchorBox = Pick<DOMRect, 'top' | 'right' | 'bottom' | 'width' | 'height'>;

/**
 * Places a menu under the anchor, right edges aligned, then clamps the left edge into the viewport.
 * Returns null when the anchor is not laid out (for example `display: none`).
 */
export function computeAnchoredMenuPosition(
  anchor: AnchorBox,
  menuWidth: number,
  viewportWidth: number,
): { top: number; left: number } | null {
  if (anchor.width <= 0 || anchor.height <= 0 || viewportWidth <= 0) return null;
  const width = menuWidth > 0 ? menuWidth : 0;
  const minLeft = ANCHORED_MENU_VIEWPORT_MARGIN_PX;
  const maxLeft = Math.max(minLeft, viewportWidth - ANCHORED_MENU_VIEWPORT_MARGIN_PX - width);
  const aligned = anchor.right - width;
  const left = Math.min(Math.max(aligned, minLeft), maxLeft);
  return { top: anchor.bottom, left };
}

/**
 * Tracks a fixed menu against its anchor button. Recomputes on scroll (capture) and resize.
 * The vertical gap stays on the menu (`mt-2` / `mt-3`); `top` is the anchor's bottom edge.
 */
export function useAnchoredFixedMenu(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  fallbackWidthPx: number,
): { top: number; left: number } | null {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor || !anchor.isConnected) {
        setPos(null);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const measured = menuRef.current?.offsetWidth ?? 0;
      setPos(computeAnchoredMenuPosition(rect, measured || fallbackWidthPx, window.innerWidth));
    };

    update();
    const raf = requestAnimationFrame(update);

    let ro: ResizeObserver | undefined;
    const node = menuRef.current;
    if (node && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => update());
      ro.observe(node);
    }

    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef, menuRef, fallbackWidthPx]);

  return pos;
}
