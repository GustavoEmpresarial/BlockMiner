/**
 * Logical canvas coordinate space for Miner Games (memory + match-3).
 * Drawing and hit-testing both use this space; the canvas may scale via CSS and DPR.
 */
export const MINER_GAMES_LOGICAL_SIZE = 500;

/** Power Match uses a larger logical canvas so the 8×8 grid is easier to play. */
export const MATCH3_LOGICAL_SIZE = 680;

/**
 * Memory grid layout (4×4) in logical pixels.
 * @param {number} [logicalSize=MINER_GAMES_LOGICAL_SIZE]
 * @returns {{ cols: number, rows: number, padding: number, size: number, sx: number, sy: number, stride: number }}
 */
export function getMemoryGridLayout(logicalSize = MINER_GAMES_LOGICAL_SIZE) {
  const cols = 4;
  const rows = 4;
  const padding = 10;
  const size = 110;
  const stride = size + padding;
  /** Matches legacy canvas math: center using cols * stride (padding after last cell is inside that span). */
  const sx = (logicalSize - cols * stride) / 2;
  const sy = (logicalSize - rows * stride) / 2;
  return { cols, rows, padding, size, sx, sy, stride };
}

/**
 * Hit-test a point in logical canvas space against the memory card grid.
 * @param {number} x
 * @param {number} y
 * @param {ReturnType<typeof getMemoryGridLayout>} [layout]
 * @returns {number | null} Server card id / board index (0–15), or null if outside any card.
 */
export function hitTestMemoryCardIndex(
  x: number,
  y: number,
  layout: ReturnType<typeof getMemoryGridLayout> = getMemoryGridLayout(),
): number | null {
  const { cols, rows, sx, sy, size, stride } = layout;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cellLeft = sx + col * stride;
      const cellTop = sy + row * stride;
      if (x >= cellLeft && x <= cellLeft + size && y >= cellTop && y <= cellTop + size) {
        return row * cols + col;
      }
    }
  }
  return null;
}

/**
 * Match-3 grid layout (8×8) in logical pixels — must match draw code.
 * Centers the cell grid inside the canvas with even padding on all sides.
 * @param {number} [logicalSize=MATCH3_LOGICAL_SIZE]
 */
export function getMatch3GridLayout(logicalSize = MATCH3_LOGICAL_SIZE) {
  const cols = 8;
  const rows = 8;
  const scale = logicalSize / MINER_GAMES_LOGICAL_SIZE;
  const boardInset = Math.round(28 * scale);
  const inner = logicalSize - boardInset * 2;
  const gap = Math.max(6, Math.round(7 * scale));
  const cellSize = Math.floor((inner - gap * (cols - 1)) / cols);
  const gridW = cols * cellSize + gap * (cols - 1);
  const gridH = rows * cellSize + gap * (rows - 1);
  const stride = cellSize + gap;
  const sx = boardInset + (inner - gridW) / 2;
  const sy = boardInset + (inner - gridH) / 2;
  return { cols, rows, cellSize, gap, sx, sy, stride, boardInset, gridW, gridH };
}

/**
 * Hit-test match-3 board in logical canvas space.
 * @returns {{ cx: number, cy: number } | null}
 */
export function hitTestMatch3Cell(
  x: number,
  y: number,
  layout: ReturnType<typeof getMatch3GridLayout> = getMatch3GridLayout(),
): { cx: number; cy: number } | null {
  const { cols, rows, sx, sy, cellSize, stride } = layout;
  const col = Math.floor((x - sx) / stride);
  const row = Math.floor((y - sy) / stride);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  const cellLeft = sx + col * stride;
  const cellTop = sy + row * stride;
  if (x > cellLeft + cellSize || y > cellTop + cellSize) return null;
  return { cx: col, cy: row };
}
