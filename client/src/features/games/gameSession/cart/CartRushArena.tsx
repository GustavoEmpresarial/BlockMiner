import React, { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { TranslateFn } from "../../lib/games.i18n";
import { CART_LOGICAL_HEIGHT, CART_LOGICAL_WIDTH } from "../lib/gameSession.constants";
import { CART_TOUCH_SWIPE_THRESHOLD } from "../lib/gameSession.constants";
import type { CartStateRef, Particle, SceneryItem } from "../lib/gameSession.types";
import { drawCartFrame } from "./cart.draw";
import { preloadCartSprites } from "./cart.sprites";

export type CartRushArenaProps = {
  cartStateRef: MutableRefObject<CartStateRef>;
  particlesRef: MutableRefObject<Particle[]>;
  sceneryRef: MutableRefObject<SceneryItem[]>;
  isGameOver: boolean;
  isProcessing: boolean;
  timeLeft: number;
  onLaneStep: (step: number) => void;
  onPointerLane: (y: number) => void;
  onSceneryInit: () => void;
  t: TranslateFn;
};

export const CartRushArena = memo(function CartRushArena({
  cartStateRef,
  particlesRef,
  sceneryRef,
  isGameOver,
  isProcessing,
  timeLeft: _timeLeft,
  onLaneStep,
  onPointerLane,
  onSceneryInit,
  t,
}: CartRushArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameAtRef = useRef(0);
  const pointerStartYRef = useRef<number | null>(null);
  const onLaneStepRef = useRef(onLaneStep);
  const onPointerLaneRef = useRef(onPointerLane);

  useEffect(() => {
    onLaneStepRef.current = onLaneStep;
    onPointerLaneRef.current = onPointerLane;
  }, [onLaneStep, onPointerLane]);

  useEffect(() => {
    preloadCartSprites();
    if (sceneryRef.current.length === 0) onSceneryInit();
  }, [onSceneryInit, sceneryRef]);

  useEffect(() => {
    if (isGameOver) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isProcessing) return;
      const k = String(e.key || "").toLowerCase();
      let step = 0;
      if (k === "arrowup" || k === "w") step = -1;
      else if (k === "arrowdown" || k === "s") step = 1;
      else return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() || "";
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      e.preventDefault();
      onLaneStepRef.current(step);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isGameOver, isProcessing]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applyDpr = () => {
      const c = canvasRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = rect.width > 0 ? rect.width : CART_LOGICAL_WIDTH;
      const displayHeight = rect.height > 0 ? rect.height : CART_LOGICAL_HEIGHT;
      c.width = Math.round(displayWidth * dpr);
      c.height = Math.round(displayHeight * dpr);
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.setTransform(c.width / CART_LOGICAL_WIDTH, 0, 0, c.height / CART_LOGICAL_HEIGHT, 0, 0);
      }
    };
    applyDpr();
    window.addEventListener("resize", applyDpr);
    return () => window.removeEventListener("resize", applyDpr);
  }, []);

  useEffect(() => {
    if (isGameOver) {
      lastFrameAtRef.current = 0;
      return;
    }
    let raf = 0;

    const tick = (frameTime: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const deltaMs = lastFrameAtRef.current === 0 ? 16 : Math.min(64, frameTime - lastFrameAtRef.current);
      lastFrameAtRef.current = frameTime;
      const deltaSeconds = deltaMs / 1000;

      ctx.clearRect(0, 0, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
      drawCartFrame(ctx, deltaSeconds, now, {
        cartStateRef,
        sceneryRef,
        particlesRef,
        isGameOver: false,
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cartStateRef, isGameOver, particlesRef, sceneryRef]);

  const syncPointerY = useCallback((clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const y = ((clientY - rect.top) / rect.height) * CART_LOGICAL_HEIGHT;
    onPointerLaneRef.current(y);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isGameOver || isProcessing) return;
      pointerStartYRef.current = e.clientY;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [isGameOver, isProcessing],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isGameOver || isProcessing) return;
      if (e.pointerType === "mouse" && e.buttons === 0) return;
      syncPointerY(e.clientY);
    },
    [isGameOver, isProcessing, syncPointerY],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const startY = pointerStartYRef.current;
      pointerStartYRef.current = null;
      if (isGameOver || isProcessing || startY == null) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) >= CART_TOUCH_SWIPE_THRESHOLD) {
        onLaneStepRef.current(dy < 0 ? -1 : 1);
      } else {
        syncPointerY(e.clientY);
      }
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
    },
    [isGameOver, isProcessing, syncPointerY],
  );

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none select-none"
      aria-label={t("minerGames.cart_rush_title")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
});
