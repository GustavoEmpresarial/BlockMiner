import { describe, expect, it } from 'vitest';
import { ANCHORED_MENU_VIEWPORT_MARGIN_PX, computeAnchoredMenuPosition } from './anchoredMenuPosition';

const anchor = (right: number, bottom = 80): Parameters<typeof computeAnchoredMenuPosition>[0] => ({
  top: bottom - 36,
  right,
  bottom,
  width: 36,
  height: 36,
});

describe('computeAnchoredMenuPosition', () => {
  it('aligns the menu right edge with the anchor and hangs from its bottom', () => {
    expect(computeAnchoredMenuPosition(anchor(1200), 320, 1440)).toEqual({ top: 80, left: 880 });
  });

  it('clamps the left edge inside the viewport', () => {
    expect(computeAnchoredMenuPosition(anchor(40), 320, 768)).toEqual({
      top: 80,
      left: ANCHORED_MENU_VIEWPORT_MARGIN_PX,
    });
  });

  it('returns null when the anchor is not laid out', () => {
    expect(
      computeAnchoredMenuPosition({ top: 0, right: 0, bottom: 0, width: 0, height: 0 }, 160, 1440),
    ).toBeNull();
  });
});
