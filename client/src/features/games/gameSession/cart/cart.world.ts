import { getCartTrackLayout } from "../lib/gameSession.utils";
import { CART_COLORS, CART_LOGICAL_HEIGHT, CART_LOGICAL_WIDTH } from "./cart.constants";
import type { SceneryItem } from "../lib/gameSession.types";

function drawParallaxGrid(
  ctx: CanvasRenderingContext2D,
  scroll: number,
  w: number,
  h: number,
): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, CART_COLORS.bgTop);
  grad.addColorStop(1, CART_COLORS.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = CART_COLORS.grid;
  ctx.lineWidth = 1;
  const cell = 48;
  const off = scroll % cell;
  for (let x = -cell; x < w + cell; x += cell) {
    ctx.beginPath();
    ctx.moveTo(x - off, 0);
    ctx.lineTo(x - off, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += cell) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const glow = ctx.createRadialGradient(w * 0.5, h * 0.15, 0, w * 0.5, h * 0.15, w * 0.7);
  glow.addColorStop(0, "rgba(56, 189, 248, 0.12)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function drawScenery(ctx: CanvasRenderingContext2D, items: SceneryItem[]): void {
  for (const item of items) {
    ctx.save();
    if (item.type === "mountain") {
      const g = ctx.createLinearGradient(item.x, item.y - item.size, item.x, item.y);
      g.addColorStop(0, "rgba(30, 58, 138, 0.5)");
      g.addColorStop(1, "rgba(15, 23, 42, 0.8)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(item.x - item.size, item.y);
      ctx.lineTo(item.x, item.y - item.size);
      ctx.lineTo(item.x + item.size, item.y);
      ctx.closePath();
      ctx.fill();
    } else if (item.type === "tree") {
      ctx.translate(item.x, item.y);
      ctx.fillStyle = "#422006";
      ctx.fillRect(-2, 0, 4, 10);
      ctx.fillStyle = "rgba(16, 185, 129, 0.35)";
      ctx.beginPath();
      ctx.moveTo(0, -item.size);
      ctx.lineTo(-item.size * 0.45, 0);
      ctx.lineTo(item.size * 0.45, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.translate(item.x, item.y);
      ctx.strokeStyle = "rgba(100, 116, 139, 0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -item.size);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawCartWorld(
  ctx: CanvasRenderingContext2D,
  lanes: number,
  scroll: number,
  scenery: SceneryItem[],
): ReturnType<typeof getCartTrackLayout> {
  drawParallaxGrid(ctx, scroll, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
  drawScenery(ctx, scenery);

  const layout = getCartTrackLayout(lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
  const { roadX, roadY, roadW, roadH } = layout;

  ctx.fillStyle = CART_COLORS.road;
  ctx.fillRect(roadX, roadY, roadW, roadH);

  ctx.strokeStyle = CART_COLORS.roadEdge;
  ctx.lineWidth = 3;
  ctx.strokeRect(roadX + 1.5, roadY + 1.5, roadW - 3, roadH - 3);

  ctx.strokeStyle = CART_COLORS.laneDash;
  ctx.setLineDash([36, 48]);
  ctx.lineDashOffset = -scroll;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < lanes; i++) {
    const ly = roadY + layout.laneH * i;
    ctx.moveTo(roadX, ly);
    ctx.lineTo(roadX + roadW, ly);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  const edgeGlow = ctx.createLinearGradient(roadX, roadY, roadX + 24, roadY);
  edgeGlow.addColorStop(0, CART_COLORS.laneGlow);
  edgeGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = edgeGlow;
  ctx.fillRect(roadX, roadY, 28, roadH);

  return layout;
}
