/** Default furniture art + 8 bay rects (percent of the rack image). Tune when swapping art. */

export const DEFAULT_RACK_IMAGE_URL = '/media/racks/default-shelf.svg';
/** Two large bays. Rects match the openings in showcase-3d-rack.svg (viewBox 800×500). */
export const SHOWCASE_RACK_IMAGE_URL = '/media/racks/showcase-3d-rack-fit.svg';
export const SHOWCASE_RACK_BAYS = 2;
export const SHOWCASE_RACKS_PER_ROOM = 24;
export const ENERGY_GENERATOR_IMAGE_URL = '/media/racks/energy-generator.webp';

export const VISUAL_FAN_DRAG = 'visualFan';
export const VISUAL_FAN_FROM_DRAG = 'visualFanFrom';

export function parseVisualFanDrag(dt: DataTransfer): boolean {
  return dt.getData(VISUAL_FAN_DRAG) === '1';
}

export function parseVisualFanFromDrag(dt: DataTransfer): number | null {
  const raw = dt.getData(VISUAL_FAN_FROM_DRAG);
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export const RACK_SLOT_COLUMNS = 4;
export const RACK_SLOT_ROWS = 2;

export type RackSlotRect = {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
};

const LEFT_PCT = 6.5;
const TOP_PCT = 20;
const GAP_X_PCT = 0;
const GAP_Y_PCT = 2.5;
const SLOT_W_PCT = 21.75;
const SLOT_H_PCT = 36;

/** A few pixels larger than the art’s natural fit inside the shelf bay. */
export const RACK_MACHINE_VISUAL_SCALE = 1.04;
/**
 * The rack camera already frames the bounding sphere. Scaling that canvas
 * past 1 pushes the sphere through the bay on the diagonal of the spin.
 */
export const RACK_MODEL_VISUAL_SCALE = 1;

function buildSlotRects(): RackSlotRect[] {
  const rects: RackSlotRect[] = [];
  for (let i = 0; i < RACK_SLOT_COLUMNS * RACK_SLOT_ROWS; i++) {
    const col = i % RACK_SLOT_COLUMNS;
    const row = Math.floor(i / RACK_SLOT_COLUMNS);
    rects.push({
      xPct: LEFT_PCT + col * (SLOT_W_PCT + GAP_X_PCT),
      yPct: TOP_PCT + row * (SLOT_H_PCT + GAP_Y_PCT),
      wPct: SLOT_W_PCT,
      hPct: SLOT_H_PCT,
    });
  }
  return rects;
}

export const RACK_SLOT_RECTS: RackSlotRect[] = buildSlotRects();

/** Top then bottom bay. Matches showcase-3d-rack-fit.svg (viewBox 1500×1080). */
export const SHOWCASE_RACK_SLOT_RECTS: RackSlotRect[] = [
  { xPct: 5, yPct: 12, wPct: 90, hPct: 38 },
  { xPct: 5, yPct: 56, wPct: 90, hPct: 38 },
];

export type SlotOverlayStyle = {
  left: string;
  top: string;
  width: string;
  height: string;
};

function rectToStyle(rect: RackSlotRect): SlotOverlayStyle {
  return {
    left: `${rect.xPct}%`,
    top: `${rect.yPct}%`,
    width: `${rect.wPct}%`,
    height: `${rect.hPct}%`,
  };
}

/** Overlay box for a visual slot. 2-slot miners merge the next bay on the same row. */
export function computeSlotOverlayStyle(slotIndex: number, slotSize: number): SlotOverlayStyle | null {
  const primary = RACK_SLOT_RECTS[slotIndex];
  if (!primary) return null;
  const size = Math.max(1, Math.floor(Number(slotSize) || 1));
  if (size <= 1) return rectToStyle(primary);

  const nextIndex = slotIndex + 1;
  const next = RACK_SLOT_RECTS[nextIndex];
  const sameRow =
    Math.floor(slotIndex / RACK_SLOT_COLUMNS) === Math.floor(nextIndex / RACK_SLOT_COLUMNS);
  if (!next || !sameRow) return rectToStyle(primary);

  return rectToStyle({
    xPct: primary.xPct,
    yPct: primary.yPct,
    wPct: next.xPct + next.wPct - primary.xPct,
    hPct: Math.max(primary.hPct, next.hPct),
  });
}

/** One machine per bay. slotSize does not merge the two openings. */
export function computeShowcaseSlotOverlayStyle(slotIndex: number): SlotOverlayStyle | null {
  const rect = SHOWCASE_RACK_SLOT_RECTS[slotIndex];
  if (!rect) return null;
  return rectToStyle(rect);
}
