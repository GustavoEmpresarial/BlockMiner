import type { SkyConfig, SkyParticle, SkyPhysicsState } from "./skyRunner.util";
import type { SkyRunnerAssets } from "./skyRunner.assets";
import { imageIsDrawable } from "./skyRunner.assets";

export type SkyRenderFrame = {
  now: number;
  tiltDeg: number;
  invulnerable: boolean;
  hitFlash: number;
  propellerAngle: number;
  particles: SkyParticle[];
  scrollOffset: number;
};

const STAR_COUNT = 72;
const GROUND_H = 46;

function drawBackground(
  ctx: CanvasRenderingContext2D,
  config: SkyConfig,
  assets: SkyRunnerAssets | null,
  frame: SkyRenderFrame,
): void {
  const { worldW: w, worldH: h } = config;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#020617");
  sky.addColorStop(0.22, "#071334");
  sky.addColorStop(0.48, "#0b3a5a");
  sky.addColorStop(0.74, "#075985");
  sky.addColorStop(1, "#0ea5e9");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const aurora = ctx.createLinearGradient(0, h * 0.18, w, h * 0.55);
  aurora.addColorStop(0, "rgba(34,211,238,0)");
  aurora.addColorStop(0.4, "rgba(56,189,248,0.12)");
  aurora.addColorStop(0.7, "rgba(251,191,36,0.08)");
  aurora.addColorStop(1, "rgba(14,165,233,0)");
  ctx.fillStyle = aurora;
  ctx.fillRect(0, 0, w, h);

  const moonX = w * 0.8;
  const moonY = h * 0.13;
  const halo = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, w * 0.2);
  halo.addColorStop(0, "rgba(254,243,199,0.55)");
  halo.addColorStop(0.4, "rgba(251,191,36,0.14)");
  halo.addColorStop(1, "rgba(251,191,36,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(moonX, moonY, w * 0.2, 0, Math.PI * 2);
  ctx.fill();

  if (assets && imageIsDrawable(assets.moon)) {
    const size = w * 0.16;
    ctx.drawImage(assets.moon, moonX - size / 2, moonY - size / 2, size, size);
  } else {
    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.arc(moonX, moonY, w * 0.055, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const sx = (((i * 97) % 1000) / 1000) * w;
    const sy = (((i * 53) % 700) / 1000) * h * 0.52;
    const twinkle = 0.28 + 0.72 * Math.abs(Math.sin(frame.now / 820 + i * 0.7));
    ctx.fillStyle = `rgba(255,255,255,${(0.12 + twinkle * 0.55).toFixed(3)})`;
    const s = 1.1 + (i % 3) * 0.7;
    ctx.fillRect(sx, sy, s, s);
  }
}

function drawSkyline(
  ctx: CanvasRenderingContext2D,
  config: SkyConfig,
  assets: SkyRunnerAssets | null,
  frame: SkyRenderFrame,
): void {
  const y = config.worldH - GROUND_H - 78;
  const h = 86;
  const speed = 0.035;
  if (assets && imageIsDrawable(assets.skyline)) {
    const imgW = (assets.skyline.naturalWidth / assets.skyline.naturalHeight) * h;
    const offset = (frame.scrollOffset * speed) % imgW;
    ctx.globalAlpha = 0.85;
    for (let x = -offset - imgW; x < config.worldW + imgW; x += imgW) {
      ctx.drawImage(assets.skyline, x, y, imgW, h);
    }
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = "rgba(2,6,23,0.72)";
  for (let i = 0; i < 10; i += 1) {
    const bw = 22 + ((i * 17) % 28);
    const bh = 28 + ((i * 23) % 48);
    const x = ((i * 54 - frame.scrollOffset * speed) % (config.worldW + 80)) - 20;
    ctx.fillRect(x, y + h - bh, bw, bh);
  }
}

function drawCloudsProcedural(ctx: CanvasRenderingContext2D, config: SkyConfig, frame: SkyRenderFrame): void {
  const specs = [
    { y: config.worldH * 0.16, w: 150, h: 42, speed: 0.07, alpha: 0.55 },
    { y: config.worldH * 0.28, w: 118, h: 34, speed: 0.11, alpha: 0.42 },
    { y: config.worldH * 0.48, w: 100, h: 28, speed: 0.05, alpha: 0.3 },
  ];
  for (let i = 0; i < specs.length; i += 1) {
    const s = specs[i];
    const offset = (frame.scrollOffset * s.speed + i * 130) % (config.worldW + s.w);
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = i % 2 === 0 ? "#e0f2fe" : "#7dd3fc";
    ctx.beginPath();
    ctx.ellipse(config.worldW - offset, s.y, s.w * 0.35, s.h * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(config.worldW - offset + s.w * 0.28, s.y - 4, s.w * 0.28, s.h * 0.38, 0, 0, Math.PI * 2);
    ctx.ellipse(config.worldW - offset + s.w * 0.52, s.y, s.w * 0.22, s.h * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  config: SkyConfig,
  assets: SkyRunnerAssets | null,
  frame: SkyRenderFrame,
): void {
  if (!assets || !imageIsDrawable(assets.cloudA) || !imageIsDrawable(assets.cloudB)) {
    drawCloudsProcedural(ctx, config, frame);
    return;
  }
  const layers = [
    { img: assets.cloudA, y: config.worldH * 0.11, speed: 0.07, scale: 1.05, alpha: 0.7 },
    { img: assets.cloudB, y: config.worldH * 0.23, speed: 0.12, scale: 0.82, alpha: 0.55 },
    { img: assets.cloudA, y: config.worldH * 0.4, speed: 0.05, scale: 0.62, alpha: 0.38 },
    { img: assets.cloudB, y: config.worldH * 0.56, speed: 0.09, scale: 0.72, alpha: 0.32 },
  ];
  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    const imgW = layer.img.naturalWidth * layer.scale;
    const imgH = layer.img.naturalHeight * layer.scale;
    const span = config.worldW + imgW;
    const offset = ((frame.scrollOffset * layer.speed + i * 160) % span + span) % span;
    ctx.globalAlpha = layer.alpha;
    ctx.drawImage(layer.img, config.worldW - offset, layer.y, imgW, imgH);
    ctx.drawImage(layer.img, config.worldW - offset - span, layer.y, imgW, imgH);
    ctx.globalAlpha = 1;
  }
}

function drawPillarSegmentProcedural(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  capAtBottom: boolean,
): void {
  if (height <= 0) return;
  const capH = Math.min(30, height);
  const bodyH = Math.max(0, height - capH);
  const bodyGrad = ctx.createLinearGradient(x, y, x + width, y);
  bodyGrad.addColorStop(0, "#020617");
  bodyGrad.addColorStop(0.5, "#334155");
  bodyGrad.addColorStop(1, "#020617");
  if (capAtBottom) {
    if (bodyH > 0) {
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(x, y, width, bodyH);
    }
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(x - 4, y + bodyH - 2, width + 8, capH);
  } else {
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(x - 4, y, width + 8, capH);
    if (bodyH > 0) {
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(x, y + capH, width, bodyH);
    }
  }
}

function drawPillarSegment(
  ctx: CanvasRenderingContext2D,
  assets: SkyRunnerAssets | null,
  x: number,
  y: number,
  width: number,
  height: number,
  capAtBottom: boolean,
): void {
  if (!assets || !imageIsDrawable(assets.pillarBody) || !imageIsDrawable(assets.pillarCap)) {
    drawPillarSegmentProcedural(ctx, x, y, width, height, capAtBottom);
    return;
  }
  if (height <= 0) return;
  const capH = Math.min(32, height);
  const bodyH = Math.max(0, height - capH);
  const bodyTile = assets.pillarBody.naturalHeight || 48;

  if (capAtBottom) {
    if (bodyH > 0) {
      let drawn = 0;
      while (drawn < bodyH) {
        const slice = Math.min(bodyTile, bodyH - drawn);
        ctx.drawImage(assets.pillarBody, 0, 0, assets.pillarBody.naturalWidth, slice, x, y + drawn, width, slice);
        drawn += slice;
      }
    }
    ctx.drawImage(assets.pillarCap, x - 6, y + bodyH - 3, width + 12, capH);
  } else {
    ctx.drawImage(assets.pillarCap, x - 6, y, width + 12, capH);
    if (bodyH > 0) {
      let drawn = 0;
      while (drawn < bodyH) {
        const slice = Math.min(bodyTile, bodyH - drawn);
        ctx.drawImage(
          assets.pillarBody,
          0,
          0,
          assets.pillarBody.naturalWidth,
          slice,
          x,
          y + capH + drawn,
          width,
          slice,
        );
        drawn += slice;
      }
    }
  }
}

function drawGateField(
  ctx: CanvasRenderingContext2D,
  config: SkyConfig,
  pipe: SkyPhysicsState["pipes"][number],
  frame: SkyRenderFrame,
): void {
  const gapH = pipe.gapBottom - pipe.gapTop;
  if (gapH <= 0) return;
  const pulse = 0.18 + 0.12 * Math.abs(Math.sin(frame.now / 420 + pipe.id));
  const field = ctx.createLinearGradient(pipe.x, pipe.gapTop, pipe.x + config.pipeW, pipe.gapBottom);
  field.addColorStop(0, `rgba(34,211,238,${pulse})`);
  field.addColorStop(0.5, `rgba(251,191,36,${pulse * 0.45})`);
  field.addColorStop(1, `rgba(34,211,238,${pulse})`);
  ctx.fillStyle = field;
  ctx.fillRect(pipe.x + 8, pipe.gapTop, config.pipeW - 16, gapH);
  ctx.strokeStyle = `rgba(125,211,252,${0.25 + pulse})`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(pipe.x + 10, pipe.gapTop + 4, config.pipeW - 20, gapH - 8);
  ctx.setLineDash([]);
}

function drawPipes(
  ctx: CanvasRenderingContext2D,
  config: SkyConfig,
  assets: SkyRunnerAssets | null,
  state: SkyPhysicsState,
  frame: SkyRenderFrame,
): void {
  for (const pipe of state.pipes) {
    drawGateField(ctx, config, pipe, frame);
    drawPillarSegment(ctx, assets, pipe.x, 0, config.pipeW, pipe.gapTop, true);
    drawPillarSegment(
      ctx,
      assets,
      pipe.x,
      pipe.gapBottom,
      config.pipeW,
      config.worldH - pipe.gapBottom,
      false,
    );
  }
}

function drawGround(ctx: CanvasRenderingContext2D, config: SkyConfig, frame: SkyRenderFrame): void {
  const y = config.worldH - GROUND_H;
  const grad = ctx.createLinearGradient(0, y, 0, config.worldH);
  grad.addColorStop(0, "#134e4a");
  grad.addColorStop(0.35, "#0f172a");
  grad.addColorStop(1, "#020617");
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, config.worldW, GROUND_H);
  ctx.fillStyle = "rgba(251,191,36,0.55)";
  ctx.fillRect(0, y, config.worldW, 3);
  ctx.fillStyle = "rgba(34,211,238,0.35)";
  ctx.fillRect(0, y + 3, config.worldW, 1);
  const stripe = ((frame.scrollOffset * 0.22) % 36);
  for (let x = -stripe; x < config.worldW; x += 36) {
    ctx.fillStyle = "rgba(15,23,42,0.55)";
    ctx.fillRect(x, y + 16, 18, 5);
    ctx.fillStyle = "rgba(251,191,36,0.18)";
    ctx.fillRect(x + 4, y + 28, 8, 3);
  }
}

function drawDroneProcedural(
  ctx: CanvasRenderingContext2D,
  config: SkyConfig,
  state: SkyPhysicsState,
  frame: SkyRenderFrame,
): void {
  const size = config.planeRadius * 2.45;
  ctx.save();
  ctx.translate(config.planeX, state.y);
  ctx.rotate((frame.tiltDeg * Math.PI) / 180);
  if (frame.invulnerable && Math.floor(frame.now / 90) % 2 === 0) ctx.globalAlpha = 0.38;
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.44, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#38bdf8";
  ctx.beginPath();
  ctx.moveTo(-size * 0.1, -size * 0.06);
  ctx.lineTo(size * 0.08, -size * 0.36);
  ctx.lineTo(size * 0.2, -size * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(size * 0.12, -size * 0.02, size * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fbbf24";
  ctx.font = `bold ${Math.round(size * 0.14)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("#", size * 0.12, -size * 0.02);
  ctx.restore();
}

function drawDrone(
  ctx: CanvasRenderingContext2D,
  config: SkyConfig,
  assets: SkyRunnerAssets | null,
  state: SkyPhysicsState,
  frame: SkyRenderFrame,
): void {
  if (!assets || !imageIsDrawable(assets.drone)) {
    drawDroneProcedural(ctx, config, state, frame);
    return;
  }
  const size = config.planeRadius * 2.5;
  ctx.save();
  ctx.translate(config.planeX, state.y);
  ctx.rotate((frame.tiltDeg * Math.PI) / 180);
  if (frame.invulnerable && Math.floor(frame.now / 90) % 2 === 0) {
    ctx.globalAlpha = 0.38;
  }
  ctx.shadowColor = "rgba(14,165,233,0.45)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.drawImage(assets.drone, -size / 2, -size / 2, size, size);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "rgba(186,230,253,0.85)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(size * 0.36, 0, 1.6, size * 0.2, frame.propellerAngle, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(size * 0.36, 0, size * 0.2, 1.6, frame.propellerAngle, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, config: SkyConfig): void {
  const { worldW: w, worldH: h } = config;
  const vig = ctx.createRadialGradient(w * 0.45, h * 0.45, h * 0.2, w * 0.5, h * 0.5, h * 0.78);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(2,6,23,0.42)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: SkyParticle[]): void {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawSkyRunnerFrame(
  ctx: CanvasRenderingContext2D,
  config: SkyConfig,
  assets: SkyRunnerAssets | null,
  state: SkyPhysicsState,
  frame: SkyRenderFrame,
): void {
  const { worldW, worldH } = config;
  ctx.clearRect(0, 0, worldW, worldH);
  drawBackground(ctx, config, assets, frame);
  drawSkyline(ctx, config, assets, frame);
  drawClouds(ctx, config, assets, frame);
  drawPipes(ctx, config, assets, state, frame);
  drawGround(ctx, config, frame);
  drawParticles(ctx, frame.particles);
  drawDrone(ctx, config, assets, state, frame);
  drawVignette(ctx, config);

  if (frame.hitFlash > 0) {
    ctx.fillStyle = `rgba(239,68,68,${Math.min(0.42, frame.hitFlash).toFixed(3)})`;
    ctx.fillRect(0, 0, worldW, worldH);
  }
}

export function spawnFlapParticles(
  config: SkyConfig,
  state: SkyPhysicsState,
  particles: SkyParticle[],
): void {
  for (let i = 0; i < 8; i += 1) {
    particles.push({
      x: config.planeX - config.planeRadius * 0.55 + (Math.random() - 0.5) * 10,
      y: state.y + config.planeRadius * 0.15,
      vx: -90 - Math.random() * 70,
      vy: (Math.random() - 0.5) * 90,
      life: 0.5 + Math.random() * 0.3,
      size: 2 + Math.random() * 2.8,
      color: i % 2 === 0 ? "#FBBF24" : "#67E8F9",
    });
  }
}

export function spawnHitParticles(
  config: SkyConfig,
  state: SkyPhysicsState,
  particles: SkyParticle[],
): void {
  for (let i = 0; i < 16; i += 1) {
    const angle = (Math.PI * 2 * i) / 16;
    particles.push({
      x: config.planeX,
      y: state.y,
      vx: Math.cos(angle) * (100 + Math.random() * 80),
      vy: Math.sin(angle) * (100 + Math.random() * 80),
      life: 0.65 + Math.random() * 0.35,
      size: 2.4 + Math.random() * 3.2,
      color: i % 3 === 0 ? "#F87171" : "#FBBF24",
    });
  }
}

export function tickParticles(particles: SkyParticle[], dtSec: number): void {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.life -= dtSec * 1.4;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

export function smoothTilt(current: number, vy: number, maxVy: number): number {
  const target = Math.max(-30, Math.min(70, (vy / maxVy) * 60));
  return current + (target - current) * 0.22;
}
