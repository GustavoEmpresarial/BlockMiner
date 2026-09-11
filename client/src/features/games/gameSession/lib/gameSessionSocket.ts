import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";

import {
  translateGameSocketError,
  translateGameReward,
} from "../../lib/minerGamesSocketMessages";
import type { createMinerGamesSocketGuard } from "../../lib/minerGamesSocketGuards";
import type { GameFlowStat, GameFlowResolution } from "../../lib/finish";
import { saveGameVerifyRecord } from "../../lib/finish/gameVerifyStorage";
import { isGameSecurityRejectCode, resolveGameFinishReasonMessage } from "../../lib/finish/gameSecurityReject";
import { setGameCooldown } from "../../lib/gameCooldownStore";
import type { TranslateFn } from "../../lib/games.i18n";

import type {
  ActiveGame,
  MemoryBoardCard,
  Match3Piece,
  Match3Cell,
  SwapAnim,
  CartServerEvent,
  Particle,
  CardFlipAnim,
  GameStartedPayload,
} from "./gameSession.types";
import {
  CART_LOGICAL_WIDTH,
  CART_LOGICAL_HEIGHT,
  CART_TARGET_SCORE,
  CART_TIME_LIMIT_SECONDS,
  MEMORY_CARD_OPEN_ANIM_MS,
  MEMORY_CARD_CLOSE_ANIM_MS,
  GAME_LABEL_KEYS,
} from "./gameSession.constants";
import {
  clearTimeoutList,
  getCartTrackLayout,
  buildGameStats,
} from "./gameSession.utils";

type StackState = {
  target: number;
  playWidth: number;
  blocksPlaced: number;
  block: { width: number; travelMs: number; startedAt: number };
  base: { leftPx: number; width: number };
  tower: Array<{ leftPx: number; width: number }>;
} | null;

type SkyState = {
  seed: string;
  worldW: number;
  worldH: number;
  planeX: number;
  planeRadius: number;
  pipeW: number;
  pipeGap: number;
  pipeGapMin: number;
  pipeSpawnDx: number;
  pipeMargin: number;
  scrollSpeedBase: number;
  scrollSpeedMax: number;
  difficultyRampMs: number;
  gravity: number;
  flapVy: number;
  maxVy: number;
  minFlapIntervalMs: number;
  invulnMs: number;
  targetPipes: number;
  lives: number;
  maxLives: number;
  checkpointEveryPipes: number;
} | null;

export type GameSocketDeps = {
  guard: ReturnType<typeof createMinerGamesSocketGuard>;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  createExplosion: (x: number, y: number) => void;
  initScenery: () => void;

  // Refs
  pendingTimeoutsRef: MutableRefObject<ReturnType<typeof setTimeout>[]>;
  tRef: MutableRefObject<TranslateFn>;
  memoryBoardRef: MutableRefObject<MemoryBoardCard[] | null>;
  gameStartedAtRef: MutableRefObject<number>;
  particles: MutableRefObject<Particle[]>;
  cardFlipAnims: MutableRefObject<Map<number, CardFlipAnim>>;
  selectedCell: MutableRefObject<Match3Cell | null>;
  swapAnim: MutableRefObject<SwapAnim>;
  visualBoard: MutableRefObject<Match3Piece[][]>;
  cartStateRef: MutableRefObject<import("./gameSession.types").CartStateRef>;
  lastLaneActionTimeRef: MutableRefObject<number>;
  activeGameRef: MutableRefObject<ActiveGame>;
  sessionReadyRef: MutableRefObject<boolean>;
  isGameOverRef: MutableRefObject<boolean>;
  hudScoreRef: MutableRefObject<number>;
  skyProgressRef: MutableRefObject<{ pipesPassed: number; target: number } | null>;
  memoryProgressRef: MutableRefObject<{ pairs: number; totalPairs: number; attempts: number } | null>;
  match3ProgressRef: MutableRefObject<{ swaps: number; cascades: number } | null>;

  // Setters
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setSessionReady: Dispatch<SetStateAction<boolean>>;
  setIsGameOver: Dispatch<SetStateAction<boolean>>;
  setGameTimerKey: Dispatch<SetStateAction<number>>;
  setHudScore: Dispatch<SetStateAction<number>>;
  setSkyState: Dispatch<SetStateAction<SkyState>>;
  setTimeLeft: Dispatch<SetStateAction<number>>;
};

export function registerGameSocketHandlers(socket: Socket, deps: GameSocketDeps): void {
  socket.on("game:error", (msg: unknown) => {
    deps.guard.releaseStart();
    clearTimeoutList(deps.pendingTimeoutsRef);
    toast.error(translateGameSocketError(deps.tRef.current, msg));
    deps.setIsProcessing(false);
    deps.setSessionReady(false);
    deps.memoryBoardRef.current = null;
    deps.navigate("/games");
  });

  socket.on("game:started", (raw: unknown) => {
    const data = raw as GameStartedPayload;
    deps.guard.releaseStart();
    clearTimeoutList(deps.pendingTimeoutsRef);
    deps.setIsGameOver(false);
    deps.gameStartedAtRef.current = Date.now();
    deps.setIsProcessing(false);
    deps.setGameTimerKey((k) => k + 1);
    deps.particles.current = [];
    deps.cardFlipAnims.current.clear();

    if (data.game === "crypto-memory" && data.board) {
      deps.memoryBoardRef.current = data.board.map((c) => ({ ...c }));
      deps.setHudScore(Number(data.score) || 0);
      deps.setSessionReady(true);
    } else if (data.game === "crypto-match-3" && data.board) {
      deps.memoryBoardRef.current = null;
      deps.selectedCell.current = null;
      deps.swapAnim.current = null;
      deps.visualBoard.current = data.board.map((row, y) =>
        row.map((s, x) => ({ symbol: s, x, y, visualX: x, visualY: y, scale: 1.0 }))
      );
      deps.setHudScore(Number(data.score) || 0);
      deps.setSessionReady(true);
    } else if (data.game === "cart-rush") {
      const serverNow = performance.now();
      deps.memoryBoardRef.current = null;
      deps.selectedCell.current = null;
      deps.initScenery();
      deps.cartStateRef.current = {
        lane: Number(data.lane) || 1,
        renderLane: Number(data.lane) || 1,
        steer: 0,
        lanes: Number(data.lanes) || 3,
        health: Number(data.health) || 3,
        score: Number(data.score) || 0,
        events: [],
        targetScore: Number(data.targetScore) || CART_TARGET_SCORE,
        distance: Number(data.distance) || 0,
        btcCount: Number(data.btcCount) || 0,
        hit: null,
        roadSpeed: Number(data.roadSpeed) || 0.48,
        roadOffset: 0,
        lastServerUpdateAt: serverNow,
        lastFrameAt: serverNow,
        difficulty: 0
      };
      deps.setHudScore(Number(data.score) || 0);
      deps.setSessionReady(true);
    } else if (data.game === "sky-runner") {
      deps.memoryBoardRef.current = null;
      deps.setSkyState({
        seed: data.seed,
        worldW: data.worldW,
        worldH: data.worldH,
        planeX: data.planeX,
        planeRadius: data.planeRadius,
        pipeW: data.pipeW,
        pipeGap: data.pipeGap,
        pipeGapMin: data.pipeGapMin,
        pipeSpawnDx: data.pipeSpawnDx,
        pipeMargin: data.pipeMargin,
        scrollSpeedBase: data.scrollSpeedBase,
        scrollSpeedMax: data.scrollSpeedMax,
        difficultyRampMs: data.difficultyRampMs,
        gravity: data.gravity,
        flapVy: data.flapVy,
        maxVy: data.maxVy,
        minFlapIntervalMs: data.minFlapIntervalMs,
        invulnMs: data.invulnMs,
        targetPipes: data.targetPipes,
        lives: data.lives,
        maxLives: data.maxLives,
        checkpointEveryPipes: data.checkpointEveryPipes,
      });
      deps.setHudScore(Number(data.score) || 0);
      deps.setSessionReady(true);
    } else {
      deps.setSessionReady(false);
    }

    deps.setTimeLeft(
      data.game === "crypto-memory"
        ? 70
        : data.game === "cart-rush"
          ? Number(data.timeLimitSeconds) || CART_TIME_LIMIT_SECONDS
          : data.game === "sky-runner"
            ? 0 // No global timer — game-over is win/lose, not time-based
            : 180
    );
  });

  socket.on("game:card_flipped", (data: { id: number; symbol: string }) => {
    deps.cardFlipAnims.current.set(data.id, {
      startTime: performance.now(),
      duration: MEMORY_CARD_OPEN_ANIM_MS,
      opening: true
    });
    const board = deps.memoryBoardRef.current;
    if (!board) return;
    const card = board.find((c) => c.id === data.id);
    if (card) {
      card.symbol = data.symbol;
      card.isFlipped = true;
    }
  });

  socket.on("game:match", (data: { ids: number[]; score: number }) => {
    const board = deps.memoryBoardRef.current;
    if (board) {
      data.ids.forEach((id) => {
        const c = board.find((x) => x.id === id);
        if (c) c.isMatched = true;
      });
    }
    deps.setHudScore(data.score);
    deps.createExplosion(250, 250);
  });

  socket.on("game:mismatch", (data: { ids: number[] }) => {
    deps.setIsProcessing(true);
    const now = performance.now();
    data.ids.forEach((id) => {
      deps.cardFlipAnims.current.set(id, {
        startTime: now,
        duration: MEMORY_CARD_CLOSE_ANIM_MS,
        opening: false
      });
    });
    const t1 = setTimeout(() => {
      const board = deps.memoryBoardRef.current;
      if (!board) return;
      data.ids.forEach((id) => {
        const c = board.find((x) => x.id === id);
        if (c) {
          c.isFlipped = false;
          c.symbol = null;
        }
      });
    }, MEMORY_CARD_CLOSE_ANIM_MS);
    const t2 = setTimeout(() => deps.setIsProcessing(false), MEMORY_CARD_CLOSE_ANIM_MS + 50);
    deps.pendingTimeoutsRef.current.push(t1, t2);
  });

  socket.on("game:board_update", (data: { board?: string[][]; score: number }) => {
    if (!data.board) return;
    deps.swapAnim.current = null;
    deps.selectedCell.current = null;
    if (deps.visualBoard.current.length > 0) {
      deps.visualBoard.current = data.board.map((row, y) =>
        row.map((symbol, x) => {
          const currentVisual = deps.visualBoard.current[y]?.[x];
          if (!currentVisual || currentVisual.symbol !== symbol) {
            return { symbol, x, y, visualX: x, visualY: y - 3, scale: 1.0 };
          }
          return { ...currentVisual, x, y, scale: 1.0 };
        })
      );
    }
    deps.setHudScore(data.score);
    deps.createExplosion(250, 250);
    deps.setIsProcessing(false);
  });

  socket.on("game:invalid_swap", () => {
    if (deps.swapAnim.current) {
      const sa = deps.swapAnim.current;
      deps.swapAnim.current = {
        rx: sa.fx,
        ry: sa.fy,
        rfx: sa.tx,
        rfy: sa.ty,
        startTime: performance.now(),
        duration: 100
      };
    }
    deps.selectedCell.current = null;
  });

  socket.on("game:cart_lane", (data: { lane?: number }) => {
    const nextLane = Number(data.lane) || 0;
    const serverNow = performance.now();
    const current = deps.cartStateRef.current;
    const ignoreServerLane = deps.lastLaneActionTimeRef.current && serverNow - deps.lastLaneActionTimeRef.current < 800;
    const laneToUse = ignoreServerLane ? current.lane : nextLane;
    deps.cartStateRef.current = {
      ...current,
      lane: laneToUse,
      renderLane: Number.isFinite(current.renderLane) ? current.renderLane : laneToUse
    };
  });

  socket.on("game:cart_update", (data: Record<string, unknown>) => {
    const nextLane = Number(data.lane) || 0;
    const serverNow = performance.now();
    const current = deps.cartStateRef.current;
    const ignoreServerLane = deps.lastLaneActionTimeRef.current && serverNow - deps.lastLaneActionTimeRef.current < 800;
    const laneToUse = ignoreServerLane ? current.lane : nextLane;
    deps.cartStateRef.current = {
      ...current,
      lane: laneToUse,
      renderLane: Number.isFinite(current.renderLane) ? current.renderLane : laneToUse,
      health: Number(data.health) || 0,
      score: Number(data.score) || 0,
      targetScore: Number(data.targetScore) || current.targetScore,
      distance: Number(data.distance) || 0,
      btcCount: Number(data.btcCount) || 0,
      events: Array.isArray(data.events)
        ? (data.events as CartServerEvent[]).map((event) => ({
            ...event,
            progress: Number(event.progress) || 0,
            speed: Number(event.speed) || Number(data.roadSpeed) || current.roadSpeed || 0.48
          }))
        : [],
      hit: (data.hit as CartServerEvent | null | undefined) ?? null,
      roadSpeed: Number(data.roadSpeed) || current.roadSpeed || 0.48,
      difficulty: Number(data.difficulty) || 0,
      lastServerUpdateAt: serverNow
    };
    const hitPayload = data.hit as CartServerEvent | null | undefined;
    if (hitPayload?.kind === "enemy-car") {
      const lanes = Math.max(3, Number(deps.cartStateRef.current.lanes) || 3);
      const { roadX, roadY, roadW, laneH } = getCartTrackLayout(
        lanes,
        CART_LOGICAL_WIDTH,
        CART_LOGICAL_HEIGHT
      );
      deps.createExplosion(roadX + Math.min(roadW * 0.26, 172), roadY + laneH * deps.cartStateRef.current.lane + laneH / 2);
    }
  });

  socket.on("game:score_update", (data: { score: number }) => {
    deps.setHudScore(data.score);
  });

  // Block Stack events

  // ─── Sky Runner events ───────────────────────────────────────────────────
  // Client runs all physics in rAF (see SkyRunnerArena). The server only
  // emits `game:started` (seed + constants) and `game:finished`. The Arena
  // emits `{type:"flap"|"checkpoint"|"finish"}` actions for anti-cheat.

  socket.on(
    "game:finished",
    (data: {
      cooldownSeconds?: number;
      success?: boolean;
      messageCode?: string;
      message?: string;
      rewardCode?: string;
      rewardParams?: Record<string, unknown>;
      reward?: string;
    }) => {
      clearTimeoutList(deps.pendingTimeoutsRef);
      deps.setIsGameOver(true);
      const cd = data.cooldownSeconds || 180;
      if (deps.activeGameRef.current) setGameCooldown(deps.activeGameRef.current, cd);

      const durationMs = deps.gameStartedAtRef.current
        ? Date.now() - deps.gameStartedAtRef.current
        : 0;
      const captured: GameFlowStat[] = buildGameStats(deps.activeGameRef.current, {
        score: deps.hudScoreRef.current,
        durationMs,
        cart: deps.cartStateRef.current,
        sky: deps.skyProgressRef.current,
        memory: deps.memoryProgressRef.current,
        match3: deps.match3ProgressRef.current,
      }, deps.tRef.current).map((s) => ({ label: s.label, value: s.value }));

      // The reward is already granted (or rejected) server-side at this
      // point — build the final resolution and hand off to /games/verify.
      // The verify page never triggers a grant, so a reload there can
      // never double-count the reward.
      let resolution: GameFlowResolution;
      if (data.success) {
        resolution = {
          outcome: "success",
          rewardMessage: translateGameReward(deps.tRef.current, data),
          cooldownSeconds: cd,
          stats: captured,
        };
      } else {
        // Security rejects (antibot / anti-cheat / burst): no reward, no tournament.
        // Same verify UI for every minigame (memory, match-3, cart, sky) — not only 2048.
        const isRejected = isGameSecurityRejectCode(data.messageCode);
        resolution = {
          outcome: isRejected ? "rejected" : "failure",
          rewardMessage: null,
          cooldownSeconds: cd,
          stats: captured,
          reasonKey: data.messageCode ?? null,
          reasonMessage: resolveGameFinishReasonMessage(deps.tRef.current, data),
        };
      }

      const gameKey = deps.activeGameRef.current;
      saveGameVerifyRecord({
        gameKey: gameKey ?? "",
        gameLabelKey: gameKey ? GAME_LABEL_KEYS[gameKey] : "",
        playAgainPath: gameKey ? `/games/${gameKey}` : "/games",
        stats: captured,
        resolution,
        cooldownSeconds: cd,
      });
      // RollerCoin-style: leave the game and show the full verify page
      // (with the app sidebar + navbar) instead of an overlay on the game.
      deps.navigate("/games/verify", { replace: true });
    }
  );

  socket.on("disconnect", () => {
    if (deps.sessionReadyRef.current && !deps.isGameOverRef.current) {
      toast.error(deps.tRef.current("games.sessionDisconnected", { defaultValue: "Connection lost. Returning to games." }));
      deps.navigate("/games", { replace: true });
    }
  });
}
