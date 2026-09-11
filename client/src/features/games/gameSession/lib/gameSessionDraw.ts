import type { MutableRefObject } from "react";
import { COIN_COLORS, ICON_IMAGES } from "../../lib/cryptoGameIcons";
import { scheduleUiUpdate } from "./gameSession.utils";
import type {
  CardFlipAnim,
  CryptoIconKey,
  Match3Cell,
  Match3GridLayout,
  Match3Piece,
  MemoryBoardCard,
  MemoryGridLayout,
  SwapAnim,
} from "./gameSession.types";

const ICON_IMAGES_MAP = ICON_IMAGES as Record<CryptoIconKey, HTMLImageElement>;

/**
 * Pure canvas renderer for the Crypto Memory board. Reads the board + flip
 * animations (mutating the flip map to prune finished animations, exactly as the
 * inline version did) and paints into `ctx`. No React state is touched.
 */
export function drawMemory(
  ctx: CanvasRenderingContext2D,
  board: MemoryBoardCard[] | null,
  flipAnims: Map<number, CardFlipAnim>,
  memoryLayout: MemoryGridLayout,
): void {
  if (!board?.length) return;
  const cols = 4;
  const { size, sx, sy, stride } = memoryLayout;
  const r = size / 2;
  const now = performance.now();
  board.forEach((card, i) => {
    const x = sx + (i % cols) * stride;
    const y = sy + Math.floor(i / cols) * stride;

    const anim = flipAnims.get(card.id);
    let scaleX = 1;
    let showFront = card.isFlipped || card.isMatched;
    if (anim) {
      const t = Math.min(1, (now - anim.startTime) / anim.duration);
      const cosT = Math.cos(t * Math.PI);
      scaleX = Math.abs(cosT);
      showFront = anim.opening ? cosT < 0 : cosT >= 0;
      if (t >= 1) {
        flipAnims.delete(card.id);
        scaleX = 1;
        showFront = anim.opening;
      }
    }

    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(scaleX, 1);

    ctx.fillStyle = card.isMatched ? "#0f2d1f" : showFront ? "#0d1f3a" : "#0f172a";
    ctx.beginPath();
    ctx.roundRect(-r, -r, size, size, 16);
    ctx.fill();

    ctx.strokeStyle = card.isMatched
      ? "rgba(16,185,129,0.5)"
      : showFront
        ? "rgba(59,130,246,0.5)"
        : "rgba(51,65,85,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-r, -r, size, size, 16);
    ctx.stroke();

    if (showFront && !card.isMatched) {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, "rgba(59,130,246,0.08)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-r, -r, size, size, 16);
      ctx.fill();
    }

    if (showFront || card.isMatched) {
      const img =
        card.symbol && card.symbol in ICON_IMAGES_MAP ? ICON_IMAGES_MAP[card.symbol as CryptoIconKey] : undefined;
      if (img?.complete && img.naturalWidth > 0) {
        const is = size * 0.68;
        ctx.drawImage(img, -is / 2, -is / 2, is, is);
      }
    } else {
      ctx.strokeStyle = "rgba(51,65,85,0.4)";
      ctx.lineWidth = 1;
      const hs = r * 0.6;
      for (let d = -hs; d <= hs; d += 14) {
        ctx.beginPath();
        ctx.moveTo(-hs, d);
        ctx.lineTo(hs, d);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(d, -hs);
        ctx.lineTo(d, hs);
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}

/**
 * Pure canvas renderer for the Match-3 board. Advances the per-piece visual
 * easing, resolves the active swap animation (clearing it + signalling
 * processing-done via `onProcessingDone` when it completes, identical to the
 * inline version), and paints into `ctx`.
 */
export function drawMatch3(
  ctx: CanvasRenderingContext2D,
  board: Match3Piece[][],
  match3Layout: Match3GridLayout,
  swapAnimRef: MutableRefObject<SwapAnim>,
  selectedCellRef: MutableRefObject<Match3Cell | null>,
  onProcessingDone: () => void,
): void {
  if (!board.length) return;
  const { cellSize: s, sx, sy, stride, gridW, gridH } = match3Layout;
  const eio = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

  // Board panel behind the grid — centered with even inset.
  const panelPad = 10;
  ctx.save();
  ctx.fillStyle = "rgba(6,13,24,0.92)";
  ctx.strokeStyle = "rgba(56,189,248,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(
    sx - panelPad,
    sy - panelPad,
    gridW + panelPad * 2,
    gridH + panelPad * 2,
    18,
  );
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const sa = swapAnimRef.current;
  let saOffset = 0;
  if (sa) {
    const elapsed = performance.now() - sa.startTime;
    const t = Math.min(1, elapsed / sa.duration);
    saOffset = eio(t);
    if (t >= 1) {
      swapAnimRef.current = null;
      scheduleUiUpdate(onProcessingDone);
    }
  }

  board.forEach((row, y) => {
    row.forEach((piece, x) => {
      piece.visualY += (y - piece.visualY) * 0.18;
      piece.visualX += (x - piece.visualX) * 0.18;
      const isSelected = selectedCellRef.current?.cx === x && selectedCellRef.current?.cy === y;
      piece.scale = (piece.scale ?? 1.0) + ((isSelected ? 1.15 : 1.0) - (piece.scale ?? 1.0)) * 0.2;

      let drawX = sx + piece.visualX * stride;
      let drawY = sy + piece.visualY * stride;

      if (sa) {
        const { fx, fy, tx, ty, rx, ry, rfx, rfy } = sa;
        if (fx !== undefined && fy !== undefined && tx !== undefined && ty !== undefined) {
          if (fx === x && fy === y) {
            drawX += (tx - fx) * saOffset * stride;
            drawY += (ty - fy) * saOffset * stride;
          } else if (tx === x && ty === y) {
            drawX += (fx - tx) * saOffset * stride;
            drawY += (fy - ty) * saOffset * stride;
          }
        }
        if (rx !== undefined && ry !== undefined && rfx !== undefined && rfy !== undefined) {
          if (rx === x && ry === y) {
            drawX += (rfx - rx) * saOffset * stride;
            drawY += (rfy - ry) * saOffset * stride;
          } else if (rfx === x && rfy === y) {
            drawX += (rx - rfx) * saOffset * stride;
            drawY += (ry - rfy) * saOffset * stride;
          }
        }
      }

      const col = piece.symbol in COIN_COLORS ? COIN_COLORS[piece.symbol as CryptoIconKey] : undefined;
      const cx2 = drawX + s / 2;
      const cy2 = drawY + s / 2;
      const sc = piece.scale ?? 1.0;
      const iconInset = s * 0.06;
      const iconSize = (s - iconInset * 2) * sc;
      ctx.save();

      if (isSelected) {
        ctx.strokeStyle = "rgba(125,211,252,0.95)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(drawX - 1, drawY - 1, s + 2, s + 2, 14);
        ctx.stroke();
      }

      // Flat tile — logo carries the color; no neon glow.
      ctx.fillStyle = "rgba(10,18,32,0.96)";
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, s, s, 12);
      ctx.fill();

      ctx.strokeStyle = col ? col.border.replace(/0\.\d+/, "0.35") : "rgba(51,65,85,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, s, s, 12);
      ctx.stroke();

      const img = piece.symbol in ICON_IMAGES_MAP ? ICON_IMAGES_MAP[piece.symbol as CryptoIconKey] : undefined;
      if (img?.complete && img.naturalWidth > 0) {
        ctx.translate(cx2, cy2);
        const half = iconSize / 2;
        ctx.drawImage(img, -half, -half, iconSize, iconSize);
      }
      ctx.restore();
    });
  });
}
