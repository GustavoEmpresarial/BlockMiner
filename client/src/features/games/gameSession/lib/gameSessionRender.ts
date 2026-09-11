import type { MutableRefObject } from "react";
import type { Particle } from "./gameSession.types";

/**
 * Advance and paint the shared particle pool, then reset alpha. Extracted
 * verbatim from the rAF loop — identical physics (0.92 damping, 0.06 life
 * decay) and draw order.
 */
export function updateAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  particles: MutableRefObject<Particle[]>,
): void {
  particles.current = particles.current.filter((p) => p.life > 0);
  particles.current.forEach((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= 0.06;
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1.0;
}

/** Radial background + faint grid used by the non-cart canvas games (memory, match-3). */
export function drawGameBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: { grid?: boolean } = {},
): void {
  const showGrid = options.grid !== false;
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    60,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  bgGrad.addColorStop(0, "#0d1526");
  bgGrad.addColorStop(1, "#020617");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  if (!showGrid) return;

  ctx.strokeStyle = "rgba(30,58,138,0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= Math.max(width, height); i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
    ctx.stroke();
  }
}

/** Desktop pointer crosshair for the mouse-driven games (memory, match-3). */
export function drawPointerCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isDown: boolean,
): void {
  ctx.strokeStyle = isDown ? "#ef4444" : "#3b82f6";
  ctx.lineWidth = 2;
  ctx.shadowBlur = 10;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 18, y);
  ctx.lineTo(x + 18, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x, y + 18);
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}
