import type { MutableRefObject } from "react";
import { clampCartLane } from "../lib/gameSession.utils";
import { updateAndDrawParticles } from "../lib/gameSessionRender";
import type { CartStateRef, Particle, SceneryItem } from "../lib/gameSession.types";
import { advanceCartSimulation } from "./cart.sim";
import { tickCartScenery } from "./cart.scenery";
import { drawCartWorld } from "./cart.world";
import { CART_CAR_HEIGHT, CART_CAR_WIDTH } from "./cart.constants";
import { enemySpriteKeyForEvent, getCartSprite } from "./cart.sprites";

export type DrawCartFrameRefs = {
  cartStateRef: MutableRefObject<CartStateRef>;
  sceneryRef: MutableRefObject<SceneryItem[]>;
  particlesRef: MutableRefObject<Particle[]>;
  isGameOver: boolean;
};

function drawSpriteOrBox(
  ctx: CanvasRenderingContext2D,
  spriteKey: Parameters<typeof getCartSprite>[0],
  cx: number,
  cy: number,
  w: number,
  h: number,
  fallback: () => void,
): void {
  const img = getCartSprite(spriteKey);
  if (img) {
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    return;
  }
  fallback();
}

function drawCone(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#f97316";
  ctx.beginPath();
  ctx.moveTo(-16, 12);
  ctx.lineTo(-4, -22);
  ctx.lineTo(4, -22);
  ctx.lineTo(16, 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(-10, -1);
  ctx.lineTo(-7, -10);
  ctx.lineTo(7, -10);
  ctx.lineTo(10, -1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBarrier(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(-26, -6, 52, 13);
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let ox = -40; ox < 40; ox += 14) {
    ctx.moveTo(ox, -8);
    ctx.lineTo(ox + 8, 8);
  }
  ctx.stroke();
  ctx.restore();
}

function drawPothole(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.ellipse(0, 0, 42, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0ea5e9";
  ctx.beginPath();
  ctx.ellipse(-2, 1, 32, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemyFallback(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-CART_CAR_WIDTH / 2, -CART_CAR_HEIGHT / 2, CART_CAR_WIDTH, CART_CAR_HEIGHT, 7);
  ctx.fill();
  ctx.restore();
}

function drawPlayerFallback(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.globalAlpha = alpha;
  const g = ctx.createLinearGradient(-CART_CAR_WIDTH / 2, 0, CART_CAR_WIDTH / 2, 0);
  g.addColorStop(0, "#7f1d1d");
  g.addColorStop(0.5, "#b91c1c");
  g.addColorStop(1, "#dc2626");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-CART_CAR_WIDTH / 2, -CART_CAR_HEIGHT / 2, CART_CAR_WIDTH, CART_CAR_HEIGHT, 10);
  ctx.fill();
  ctx.restore();
}

/** One cart-rush frame: world, obstacles, player, particles. */
export function drawCartFrame(
  ctx: CanvasRenderingContext2D,
  deltaSeconds: number,
  now: number,
  refs: DrawCartFrameRefs,
): void {
  const state = refs.cartStateRef.current;
  const lanes = Math.max(3, Number(state.lanes) || 3);
  const { roadPixelsPerSecond } = advanceCartSimulation(state, deltaSeconds, now);
  tickCartScenery(refs.sceneryRef.current, deltaSeconds, roadPixelsPerSecond);

  const scroll = Number(state.roadOffset) || 0;
  const layout = drawCartWorld(ctx, lanes, scroll, refs.sceneryRef.current);
  const { roadX, roadY, roadW, roadH, laneH } = layout;
  const hit = state.hit;

  for (const event of state.localEvents ?? []) {
    const lane = clampCartLane(Number(event.lane) || 0, lanes);
    const progress = Math.max(0, Math.min(1.25, Number(event.progress) || 0));
    const y = roadY + laneH * lane + laneH / 2;
    const x = roadX + roadW - progress * (roadW + 180) + 60;

    switch (event.kind) {
      case "coin":
        drawSpriteOrBox(ctx, "btc", x, y, 56, 56, () => {
          ctx.save();
          ctx.translate(x, y);
          ctx.fillStyle = "#fbbf24";
          ctx.beginPath();
          ctx.arc(0, 0, 28, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        break;
      case "cone":
        drawCone(ctx, x, y);
        break;
      case "barrier":
        drawBarrier(ctx, x, y);
        break;
      case "pothole":
        drawPothole(ctx, x, y);
        break;
      case "enemy-car":
      default: {
        const key = enemySpriteKeyForEvent(String(event.id ?? `${x}-${y}`));
        drawSpriteOrBox(ctx, key, x, y, CART_CAR_WIDTH, CART_CAR_HEIGHT, () =>
          drawEnemyFallback(ctx, x, y, event.variant?.body || "#4b5563"),
        );
        break;
      }
    }
  }

  const physX = state.physX ?? clampCartLane(Number(state.lane) || 0, lanes);
  const carX = roadX + 160;
  const carY = roadY + laneH * physX + laneH / 2;
  const tilt = (state.physVx ?? 0) * 0.07;

  if (!refs.isGameOver && Math.random() < 0.55) {
    const rx = carX - CART_CAR_WIDTH / 2 + 2;
    refs.particlesRef.current.push({
      x: rx,
      y: carY + (Math.random() - 0.5) * 14,
      vx: -6 - Math.random() * 4,
      vy: (Math.random() - 0.5) * 1,
      life: 0.55 + Math.random() * 0.25,
      color: "rgba(209, 213, 219, 0.22)",
      size: Math.random() * 3 + 2,
    });
  }

  const playerAlpha = hit ? (now % 200 < 100 ? 0.45 : 1) : 1;

  if (hit) {
    ctx.save();
    const shake = Math.sin(now * 0.04) * 8;
    ctx.translate(shake, -shake * 0.5);
  }

  const playerImg = getCartSprite("player");
  if (playerImg) {
    ctx.save();
    ctx.translate(carX, carY);
    ctx.rotate(tilt);
    ctx.globalAlpha = playerAlpha;
    ctx.drawImage(
      playerImg,
      -CART_CAR_WIDTH / 2,
      -CART_CAR_HEIGHT / 2,
      CART_CAR_WIDTH,
      CART_CAR_HEIGHT,
    );
    ctx.restore();
  } else {
    drawPlayerFallback(ctx, carX, carY, tilt, playerAlpha);
  }

  if (hit) ctx.restore();

  updateAndDrawParticles(ctx, refs.particlesRef);
}
