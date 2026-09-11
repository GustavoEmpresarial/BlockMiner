import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TranslateFn } from "../../lib/games.i18n";
import { loadSkyRunnerAssets, type SkyRunnerAssets } from "../lib/skyRunner.assets";
import {
  drawSkyRunnerFrame,
  smoothTilt,
  spawnFlapParticles,
  spawnHitParticles,
  tickParticles,
} from "../lib/skyRunner.canvas";
import {
  createPhysicsState,
  stepPhysics,
  tryFlap,
  type SkyConfig,
  type SkyParticle,
  type SkyPhysicsState,
} from "../lib/skyRunner.util";

export type { SkyConfig } from "../lib/skyRunner.util";

export const SkyRunnerArena = memo(function SkyRunnerArena({
  state,
  onFlap,
  onCheckpoint,
  onFinish,
  isGameOver,
  t,
}: {
  state: SkyConfig | null;
  onFlap: () => void;
  onCheckpoint: (info: { pipesPassed: number; elapsedMs: number; lives: number; score: number }) => void;
  onFinish: (info: { pipesPassed: number; elapsedMs: number; score: number; won: boolean }) => void;
  isGameOver: boolean;
  t: TranslateFn;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const physRef = useRef<SkyPhysicsState | null>(null);
  const assetsRef = useRef<SkyRunnerAssets | null>(null);
  const particlesRef = useRef<SkyParticle[]>([]);
  const tiltRef = useRef(0);
  const propellerRef = useRef(0);
  const hitFlashRef = useRef(0);
  const checkpointEpochRef = useRef(0);
  const lastFrameAtRef = useRef(0);

  const onCheckpointRef = useRef(onCheckpoint);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onCheckpointRef.current = onCheckpoint;
    onFinishRef.current = onFinish;
  }, [onCheckpoint, onFinish]);

  const [hud, setHud] = useState<{
    lives: number;
    pipesPassed: number;
    score: number;
    invulnerable: boolean;
    crashed: string | null;
  }>({
    lives: 0,
    pipesPassed: 0,
    score: 0,
    invulnerable: false,
    crashed: null,
  });

  useEffect(() => {
    let cancelled = false;
    loadSkyRunnerAssets()
      .then((assets) => {
        if (!cancelled) assetsRef.current = assets;
      })
      .catch(() => {
        if (!cancelled) assetsRef.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!state) {
      physRef.current = null;
      particlesRef.current = [];
      checkpointEpochRef.current = 0;
      lastFrameAtRef.current = 0;
      tiltRef.current = 0;
      hitFlashRef.current = 0;
      setHud({ lives: 0, pipesPassed: 0, score: 0, invulnerable: false, crashed: null });
      return;
    }
    physRef.current = createPhysicsState(state);
    particlesRef.current = [];
    checkpointEpochRef.current = 0;
    lastFrameAtRef.current = 0;
    tiltRef.current = 0;
    hitFlashRef.current = 0;
    setHud({
      lives: state.lives,
      pipesPassed: 0,
      score: 0,
      invulnerable: false,
      crashed: null,
    });
  }, [state]);

  const flap = useCallback(() => {
    const ph = physRef.current;
    if (!ph || !state) return;
    const now = performance.now();
    if (tryFlap(ph, state, now)) {
      spawnFlapParticles(state, ph, particlesRef.current);
      onFlap();
    }
  }, [state, onFlap]);

  const flapRef = useRef(flap);
  useEffect(() => {
    flapRef.current = flap;
  }, [flap]);

  useEffect(() => {
    if (isGameOver) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = String(e.key || "").toLowerCase();
      const isSpace = k === " " || e.code === "Space" || k === "spacebar";
      const isUp = k === "arrowup" || k === "w";
      if (!isSpace && !isUp) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() || "";
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      e.preventDefault();
      flapRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isGameOver]);

  useLayoutEffect(() => {
    if (!state) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applyDpr = () => {
      const c = canvasRef.current;
      if (!c || !state) return;
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = rect.width > 0 ? rect.width : state.worldW;
      const displayHeight = rect.height > 0 ? rect.height : state.worldH;
      c.width = Math.round(displayWidth * dpr);
      c.height = Math.round(displayHeight * dpr);
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.setTransform(c.width / state.worldW, 0, 0, c.height / state.worldH, 0, 0);
      }
    };
    applyDpr();
    window.addEventListener("resize", applyDpr);
    return () => window.removeEventListener("resize", applyDpr);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    let raf = 0;

    const tick = () => {
      const ph = physRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ph || !ctx) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const dt = lastFrameAtRef.current === 0 ? 0 : Math.min(64, now - lastFrameAtRef.current);
      lastFrameAtRef.current = now;
      const dtSec = dt / 1000;

      if (!ph.finished && !ph.crashed && dt > 0) {
        const { events, checkpointEpoch } = stepPhysics(ph, state, dt, now, checkpointEpochRef.current);
        checkpointEpochRef.current = checkpointEpoch;

        for (const ev of events) {
          if (ev.type === "checkpoint") onCheckpointRef.current(ev);
          if (ev.type === "finish") {
            setHud((h) => ({ ...h, crashed: ev.won ? null : ph.crashed, score: ev.score }));
            onFinishRef.current(ev);
          }
          if (ev.type === "life_lost") {
            hitFlashRef.current = 1;
            spawnHitParticles(state, ph, particlesRef.current);
            setHud((h) => ({
              ...h,
              lives: ev.lives,
              invulnerable: ev.lives > 0,
            }));
          }
          if (ev.type === "pipe_scored") {
            setHud((h) => ({ ...h, pipesPassed: ev.pipesPassed, score: ev.score }));
          }
          if (ev.type === "invuln_changed") {
            setHud((h) => ({ ...h, invulnerable: ev.invulnerable }));
          }
        }
      }

      tickParticles(particlesRef.current, dtSec);
      propellerRef.current += dtSec * 28;
      tiltRef.current = smoothTilt(tiltRef.current, ph.vy, state.maxVy);
      if (hitFlashRef.current > 0) hitFlashRef.current = Math.max(0, hitFlashRef.current - dtSec * 2.2);

      drawSkyRunnerFrame(ctx, state, assetsRef.current, ph, {
        now,
        tiltDeg: tiltRef.current,
        invulnerable: now < ph.invulnUntil,
        hitFlash: hitFlashRef.current,
        propellerAngle: propellerRef.current,
        particles: particlesRef.current,
        scrollOffset: ph.elapsedMs * 0.17,
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  if (!state) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase tracking-[0.35em] text-cyan-200/70">
        {t("minerGames.loading")}
      </div>
    );
  }

  const progress = state.targetPipes > 0 ? Math.min(1, hud.pipesPassed / state.targetPipes) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("minerGames.sky_runner.flap_aria")}
      onPointerDown={(e) => {
        e.preventDefault();
        flap();
      }}
      className="relative h-full w-full select-none overflow-hidden bg-[#020617]"
      style={{ touchAction: "manipulation" }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      <div className="pointer-events-none absolute inset-x-0 top-0 px-3 pt-3 sm:px-4">
        <div className="flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-slate-950/55 px-2.5 py-2 shadow-[0_8px_32px_rgba(2,6,23,0.45)] backdrop-blur-md sm:gap-3 sm:px-3">
          <div
            className="flex shrink-0 items-center gap-1"
            aria-label={t("minerGames.sky_runner.lives_aria", { lives: hud.lives })}
          >
            {Array.from({ length: state.maxLives }).map((_, i) => {
              const filled = i < hud.lives;
              return (
                <span
                  key={i}
                  className={[
                    "inline-block h-3 w-3 rotate-45 border transition-all duration-300 sm:h-3.5 sm:w-3.5",
                    filled
                      ? "border-amber-200 bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.85)]"
                      : "border-slate-600 bg-slate-800/80 opacity-50",
                  ].join(" ")}
                  aria-hidden
                />
              );
            })}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase tracking-[0.22em] text-cyan-100/80">
              <span>{t("minerGames.sky_runner.gates_label")}</span>
              <span>
                {t("minerGames.sky_runner.pipes_progress", {
                  current: hud.pipesPassed,
                  total: state.targetPipes,
                })}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800/90">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-cyan-300 to-sky-400 transition-[width] duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">
              {t("minerGames.hash_score_label")}
            </p>
            <p className="font-mono text-sm font-black tabular-nums text-amber-200 sm:text-base">{hud.score}</p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
        <span className="rounded-full border border-white/10 bg-slate-950/55 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/80 backdrop-blur-sm">
          {t("minerGames.sky_runner.tap_hint")}
        </span>
      </div>

      {hud.crashed ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-red-950/45 backdrop-blur-[2px]">
          <span className="rounded-2xl border border-red-300/40 bg-red-600/95 px-7 py-3 text-2xl font-black uppercase tracking-[0.28em] text-white shadow-2xl">
            {t("minerGames.sky_runner.crashed")}
          </span>
        </div>
      ) : null}
    </div>
  );
});
