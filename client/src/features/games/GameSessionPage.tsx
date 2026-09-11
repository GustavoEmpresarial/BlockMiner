import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useNavigate, useParams } from "react-router-dom";
import {
  getMemoryGridLayout,
  hitTestMemoryCardIndex,
  getMatch3GridLayout,
  hitTestMatch3Cell
} from "./lib/minerGamesLayout";
import { createMinerGamesSocketGuard } from "./lib/minerGamesSocketGuards";
import { t } from "./lib/games.i18n";
import { preloadCryptoGameIcons } from "./lib/cryptoGameIcons";
import { preloadCartSprites } from "./gameSession/cart/cart.sprites";

import type {
  ActiveGame,
  MemoryBoardCard,
  Match3Piece,
  Match3Cell,
  SwapAnim,
  SceneryItem,
  CartStateRef,
  Particle,
  CardFlipAnim,
  MemoryGridLayout,
  Match3GridLayout,
} from "./gameSession/lib/gameSession.types";
import {
  SOCKET_URL,
  LOGICAL,
  MATCH3_LOGICAL_SIZE,
  CART_LOGICAL_WIDTH,
  CART_LOGICAL_HEIGHT,
  SLUG_MAP,
  MEMORY_CARD_OPEN_ANIM_MS,
  CART_TARGET_SCORE,
} from "./gameSession/lib/gameSession.constants";
import {
  clearTimeoutList,
  clampCartLane,
  getCanvasLogicalSize,
  getCanvasViewportStyle,
  getCartLaneFromPointer,
  pointerClientXY,
} from "./gameSession/lib/gameSession.utils";
import { registerGameSocketHandlers } from "./gameSession/lib/gameSessionSocket";

import { SkyRunnerArena } from "./skyRunner";
import { CartRushArena, initCartScenery } from "./gameSession/cart";
import { drawMemory as drawMemoryCanvas, drawMatch3 as drawMatch3Canvas } from "./gameSession/lib/gameSessionDraw";
import { updateAndDrawParticles, drawGameBackground, drawPointerCrosshair } from "./gameSession/lib/gameSessionRender";
import { GameSessionHud } from "./gameSession/components/GameSessionHud";
import { gameStartAntibotPayload, postGameAntibotTelemetry } from "./lib/gamesAntibotTelemetry";
import { fetchGameTurnstileStatus, submitGameTurnstilePass } from "./lib/gameTurnstileStatus";
import { GameTurnstileModal } from "./components/GameTurnstileModal";
import { toast } from "sonner";

const IS_TOUCH_DEVICE =
  typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

export default function GameSessionPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const mapping = SLUG_MAP[slug ?? ""];
  const activeGame: ActiveGame = mapping?.game ?? null;
  const serverSlug = mapping?.serverSlug ?? "";

  const tRef = useRef(t);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const sessionReadyRef = useRef(false);
  const isGameOverRef = useRef(false);
  const [turnstileOpen, setTurnstileOpen] = useState(false);
  const pendingStartSocketRef = useRef<Socket | null>(null);

  // Redirect to hub on invalid slug
  useEffect(() => {
    if (!mapping) navigate("/games", { replace: true });
  }, [mapping, navigate]);

  useEffect(() => {
    preloadCryptoGameIcons();
    preloadCartSprites();
  }, []);

  const [hudScore, setHudScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  useEffect(() => {
    sessionReadyRef.current = sessionReady;
    isGameOverRef.current = isGameOver;
  }, [sessionReady, isGameOver]);
  const gameStartedAtRef = useRef<number>(0);
  // Lightweight mirrors of gameplay state, snapshot-safe from inside socket callbacks.
  const hudScoreRef = useRef(0);
  const skyProgressRef = useRef<{ pipesPassed: number; target: number } | null>(null);
  const memoryProgressRef = useRef<{ pairs: number; totalPairs: number; attempts: number } | null>(null);
  const match3ProgressRef = useRef<{ swaps: number; cascades: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Which tab is open in the games index: our minigames or the curated
   * partner-games catalog. Tabs only render when no game is active.
   */

  /**
   * Sky Runner config (Flappy-Bird-style airplane). Client-authoritative
   * physics: the server only seeds the run + receives checkpoints for
   * anti-cheat. The Arena runs gravity, scroll, pipe spawning and collision
   * detection itself in a rAF loop using the constants below, so there is
   * zero input-to-render delay.
   */
  const [skyState, setSkyState] = useState<{
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
  } | null>(null);
  /** Server sets allowNewStart=false when a round is ACTIVE (continue), not only on cooldown. */
  const [gameTimerKey, setGameTimerKey] = useState(0);
  const activeGameRef = useRef<ActiveGame>(null);

  // Mirror hudScore → ref so socket callbacks can snapshot the latest score.
  useEffect(() => { hudScoreRef.current = hudScore; }, [hudScore]);

  useEffect(() => {
    activeGameRef.current = activeGame;
  }, [activeGame]);

  const memoryLayout = useMemo<MemoryGridLayout>(() => getMemoryGridLayout(LOGICAL), []);
  const match3Layout = useMemo<Match3GridLayout>(() => getMatch3GridLayout(MATCH3_LOGICAL_SIZE), []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameLoopRef = useRef<number | null>(null);
  const particles = useRef<Particle[]>([]);
  const visualBoard = useRef<Match3Piece[][]>([]);
  const pointer = useRef({ x: 250, y: 250, isDown: false });
  const selectedCell = useRef<Match3Cell | null>(null);
  const swapAnim = useRef<SwapAnim>(null);
  const memoryBoardRef = useRef<MemoryBoardCard[] | null>(null);
  const cartStateRef = useRef<CartStateRef>({
    lane: 1,
    renderLane: 1,
    steer: 0,
    lanes: 3,
    health: 3,
    score: 0,
    events: [],
    targetScore: CART_TARGET_SCORE,
    distance: 0,
    btcCount: 0,
    hit: null,
    roadSpeed: 0.48,
    roadOffset: 0,
    lastServerUpdateAt: 0,
    lastFrameAt: 0,
    difficulty: 0
  });
  const cardFlipAnims = useRef(new Map<number, CardFlipAnim>());
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const socketEmitGuardRef = useRef(createMinerGamesSocketGuard());

  // Throttling and input authority refs for Cart Rush
  const lastLaneActionTimeRef = useRef<number>(0);
  const sceneryRef = useRef<SceneryItem[]>([]);

  const initScenery = useCallback(() => {
    sceneryRef.current = initCartScenery();
  }, []);


  const createExplosion = useCallback((x: number, y: number) => {
    if (particles.current.length > 30) return;
    for (let i = 0; i < 8; i += 1) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        life: 1.0,
        color: "#3b82f6",
        size: Math.random() * 4 + 1.5
      });
    }
  }, []);

  useEffect(() => {
    const guard = socketEmitGuardRef.current;
    const newSocket = io(SOCKET_URL, {
      // Prefer cookie session; omit explicit JWT so invalid/absent token does not reject handshake.
      withCredentials: true,
      reconnection: false,
      transports: ['polling', 'websocket'],
      timeout: Math.max(60_000, Number(import.meta.env.VITE_SOCKET_TIMEOUT_MS) || 120_000),
    });

    // Auto-start the game for this session (socket.io queues until connected)
    if (activeGame && socketEmitGuardRef.current.tryBeginStart()) {
      activeGameRef.current = activeGame;
      if (activeGame === "cart") initScenery();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per-game state at session start, before the socket connects.
      if (activeGame === "sky") setSkyState(null);
      memoryBoardRef.current = null;
      postGameAntibotTelemetry(serverSlug, "start");
      void (async () => {
        const status = await fetchGameTurnstileStatus();
        if (status.required) {
          pendingStartSocketRef.current = newSocket;
          setTurnstileOpen(true);
          return;
        }
        newSocket.emit("game:start", gameStartAntibotPayload(serverSlug));
      })();
    }

    registerGameSocketHandlers(newSocket, {
      guard,
      navigate,
      createExplosion,
      initScenery,
      pendingTimeoutsRef,
      tRef,
      memoryBoardRef,
      gameStartedAtRef,
      particles,
      cardFlipAnims,
      selectedCell,
      swapAnim,
      visualBoard,
      cartStateRef,
      lastLaneActionTimeRef,
      activeGameRef,
      sessionReadyRef,
      isGameOverRef,
      hudScoreRef,
      skyProgressRef,
      memoryProgressRef,
      match3ProgressRef,
      setIsProcessing,
      setSessionReady,
      setIsGameOver,
      setGameTimerKey,
      setHudScore,
      setSkyState,
      setTimeLeft,
    });

    setSocket(newSocket);
    return () => {
      guard.releaseStart();
      clearTimeoutList(pendingTimeoutsRef);
      newSocket.removeAllListeners();
      newSocket.disconnect();
    };
  }, [createExplosion, activeGame, serverSlug, initScenery, navigate]);


  useEffect(() => {
    if (!gameTimerKey || isGameOver) return;
    // Sky Runner has no global countdown (win/lose by game outcome).
    if (activeGameRef.current === "sky") return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsGameOver(true);
          if (socket) socket.emit("game:end");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameTimerKey, isGameOver, socket]);

  useLayoutEffect(() => {
    if (!activeGame || activeGame === "cart" || isGameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applyDpr = () => {
      const c = canvasRef.current;
      if (!c) return;
      const { width: logicalWidth, height: logicalHeight } = getCanvasLogicalSize(activeGame);
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = rect.width > 0 ? rect.width : logicalWidth;
      const displayHeight = rect.height > 0 ? rect.height : logicalHeight;
      c.width = Math.round(displayWidth * dpr);
      c.height = Math.round(displayHeight * dpr);
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.setTransform(c.width / logicalWidth, 0, 0, c.height / logicalHeight, 0, 0);
      }
    };
    applyDpr();
    window.addEventListener("resize", applyDpr);
    return () => window.removeEventListener("resize", applyDpr);
  }, [activeGame, isGameOver, sessionReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeGame || activeGame === "cart" || !sessionReady || isGameOver) return;
    const noDefault = (e: Event) => e.preventDefault();
    canvas.addEventListener("touchstart", noDefault, { passive: false });
    canvas.addEventListener("touchmove", noDefault, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", noDefault);
      canvas.removeEventListener("touchmove", noDefault);
    };
  }, [activeGame, isGameOver, sessionReady]);

  const drawMemory = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      drawMemoryCanvas(ctx, memoryBoardRef.current, cardFlipAnims.current, memoryLayout);
    },
    [memoryLayout]
  );

  const drawMatch3 = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      drawMatch3Canvas(ctx, visualBoard.current, match3Layout, swapAnim, selectedCell, () =>
        setIsProcessing(false)
      );
    },
    [match3Layout]
  );

  useEffect(() => {
    if (!activeGame || activeGame === "cart" || !sessionReady || isGameOver) return;
    const logicalSize = getCanvasLogicalSize(activeGame);
    const render = (frameTime: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        gameLoopRef.current = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        gameLoopRef.current = requestAnimationFrame(render);
        return;
      }
      ctx.clearRect(0, 0, logicalSize.width, logicalSize.height);

      drawGameBackground(ctx, logicalSize.width, logicalSize.height, {
        grid: activeGame !== "match-3",
      });

      if (activeGame === "memory") drawMemory(ctx);
      if (activeGame === "match-3") drawMatch3(ctx);

      updateAndDrawParticles(ctx, particles);

      if (!IS_TOUCH_DEVICE) {
        drawPointerCrosshair(ctx, pointer.current.x, pointer.current.y, pointer.current.isDown);
      }

      gameLoopRef.current = requestAnimationFrame(render);
    };
    gameLoopRef.current = requestAnimationFrame(render);
    return () => {
      if (gameLoopRef.current != null) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [activeGame, sessionReady, isGameOver, drawMemory, drawMatch3]);

  const syncMouse = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: pointer.current.x, y: pointer.current.y };
      const rect = canvas.getBoundingClientRect();
      const logicalSize = getCanvasLogicalSize(activeGame);
      const { clientX, clientY } = pointerClientXY(e);
      const x = ((clientX - rect.left) / rect.width) * logicalSize.width;
      const y = ((clientY - rect.top) / rect.height) * logicalSize.height;
      pointer.current.x = x;
      pointer.current.y = y;
      return { x, y };
    },
    [activeGame]
  );

  const moveCartToPointerLane = useCallback(
    (y: number) => {
      if (!socket) return;
      const current = cartStateRef.current;
      const lanes = Math.max(3, Number(current.lanes) || 3);
      const nextLane = getCartLaneFromPointer(y, lanes, CART_LOGICAL_WIDTH, CART_LOGICAL_HEIGHT);
      if (nextLane === current.lane) return;
      if (!socketEmitGuardRef.current.tryEmitLane()) return;
      lastLaneActionTimeRef.current = performance.now();
      cartStateRef.current = {
        ...current,
        lane: nextLane,
        renderLane: Number.isFinite(current.renderLane) ? current.renderLane : current.lane
      };
      socket.emit("game:action", { type: "lane", lane: nextLane });
    },
    [socket]
  );

  const moveCartByStep = useCallback(
    (step: number) => {
      if (!socket) return;
      const current = cartStateRef.current;
      const lanes = Math.max(3, Number(current.lanes) || 3);
      const nextLane = clampCartLane(current.lane + step, lanes);
      if (nextLane === current.lane) return;
      if (!socketEmitGuardRef.current.tryEmitLane()) return;
      lastLaneActionTimeRef.current = performance.now();
      cartStateRef.current = {
        ...current,
        lane: nextLane,
        renderLane: Number.isFinite(current.renderLane) ? current.renderLane : current.lane
      };
      socket.emit("game:action", { type: "lane", lane: nextLane });
    },
    [socket]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (e.type === "mousedown" && IS_TOUCH_DEVICE) return;
      if (isGameOver || isProcessing) return;
      pointer.current.isDown = true;
      const { x, y } = syncMouse(e);
      if (!socket) return;

      if (activeGame === "memory") {
        const cardId = hitTestMemoryCardIndex(x, y, memoryLayout);
        if (cardId === null) return;
        const board = memoryBoardRef.current;
        if (board) {
          const card = board.find((c) => c.id === cardId);
          if (card && !card.isFlipped && !card.isMatched) {
            cardFlipAnims.current.set(cardId, {
              startTime: performance.now(),
              duration: MEMORY_CARD_OPEN_ANIM_MS,
              opening: true,
            });
          }
        }
        socket.emit("game:action", { type: "flip", cardId });
      } else if (activeGame === "match-3") {
        const cell = hitTestMatch3Cell(x, y, match3Layout);
        if (!cell) return;
        const { cx, cy } = cell;
        const sel = selectedCell.current;
        if (!sel) {
          selectedCell.current = { cx, cy };
        } else if (sel.cx === cx && sel.cy === cy) {
          selectedCell.current = null;
        } else {
          const dx = Math.abs(cx - sel.cx);
          const dy = Math.abs(cy - sel.cy);
          if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            if (!swapAnim.current) {
              swapAnim.current = {
                fx: sel.cx,
                fy: sel.cy,
                tx: cx,
                ty: cy,
                startTime: performance.now(),
                duration: 120
              };
              socket.emit("game:action", {
                type: "swap",
                from: { x: sel.cx, y: sel.cy },
                to: { x: cx, y: cy }
              });
              selectedCell.current = null;
              setIsProcessing(true);
            }
          } else {
            selectedCell.current = { cx, cy };
          }
        }
      }
    },
    [activeGame, isGameOver, isProcessing, socket, syncMouse, memoryLayout, match3Layout]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      syncMouse(e);
    },
    [syncMouse]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      pointer.current.isDown = false;
      syncMouse(e);
    },
    [syncMouse]
  );

  const exitSession = useCallback(() => {
    clearTimeoutList(pendingTimeoutsRef);
    if (serverSlug) {
      postGameAntibotTelemetry(serverSlug, "end", {
        sessionDurationMs: gameStartedAtRef.current ? Date.now() - gameStartedAtRef.current : undefined,
      });
    }
    if (socket) socket.emit("game:end");
    setSessionReady(false);
    memoryBoardRef.current = null;
    navigate("/games");
  }, [socket, navigate, serverSlug]);


  const handleSkyFlap = useCallback(() => {
    if (!socket || isGameOver) return;
    socket.emit("game:action", { type: "flap" });
  }, [socket, isGameOver]);

  /**
   * Anti-cheat checkpoint: Arena reports its progress + elapsed time every
   * `checkpointEveryPipes`. Server validates timing vs minimum theoretical
   * pace and may kill the session if the client is faking pipes.
   */
  const handleSkyCheckpoint = useCallback(
    (info: { pipesPassed: number; elapsedMs: number; lives: number; score: number }) => {
      if (!socket) return;
      setHudScore(info.score);
      skyProgressRef.current = { pipesPassed: info.pipesPassed, target: skyState?.targetPipes ?? 15 };
      socket.emit("game:action", { type: "checkpoint", ...info });
    },
    [socket, skyState?.targetPipes]
  );

  /**
   * End-of-run: Arena signals win or loss. Server validates the timing one
   * more time and runs `finishGame()` (which awards the reward or rejects).
   */
  const handleSkyFinish = useCallback(
    (info: { pipesPassed: number; elapsedMs: number; score: number; won: boolean }) => {
      if (!socket) return;
      setHudScore(info.score);
      skyProgressRef.current = { pipesPassed: info.pipesPassed, target: skyState?.targetPipes ?? 15 };
      socket.emit("game:action", { type: "finish", ...info });
    },
    [socket, skyState?.targetPipes]
  );

  if (!activeGame) return null;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#020617]" style={{ direction: "ltr" }}>
      {/* Loading overlay until game:started fires */}
      {!sessionReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[#020617]">
          <div className="h-24 w-24 animate-spin rounded-full border-8 border-primary border-t-transparent" />
          <p className="animate-pulse text-center text-sm font-black uppercase tracking-[0.25em] text-white sm:tracking-[0.6em]">
            {t("minerGames.syncing")}
          </p>
        </div>
      )}
          <GameSessionHud
            hudScore={hudScore}
            timeLeft={timeLeft}
            isGameOver={isGameOver}
            onExit={exitSession}
            t={t}
          />
          <div className={`flex flex-1 items-center justify-center overflow-hidden ${activeGame === "sky" ? "p-1 sm:p-3" : "p-2 sm:p-4"}`}>
            <div
              className={
                activeGame === "sky"
                  ? "relative overflow-hidden rounded-[1.75rem] border border-cyan-300/30 bg-[#010617] shadow-[0_24px_80px_rgba(2,8,23,0.9),0_0_70px_rgba(14,165,233,0.18)]"
                  : "relative overflow-hidden rounded-2xl border-2 border-slate-700 bg-black shadow-[0_0_50px_rgba(0,0,0,0.5)]"
              }
              style={getCanvasViewportStyle(activeGame)}
            >
              {/* Scanline overlay: skip for cart-rush and sky (full-speed canvas). */}
              {activeGame !== "cart" && activeGame !== "sky" ? (
                <div className="pointer-events-none absolute inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%] opacity-20" />
              ) : null}

              {activeGame === "sky" ? (
                <SkyRunnerArena
                  state={skyState}
                  onFlap={handleSkyFlap}
                  onCheckpoint={handleSkyCheckpoint}
                  onFinish={handleSkyFinish}
                  isGameOver={isGameOver}
                  t={t}
                />
              ) : activeGame === "cart" ? (
                <CartRushArena
                  cartStateRef={cartStateRef}
                  particlesRef={particles}
                  sceneryRef={sceneryRef}
                  isGameOver={isGameOver}
                  isProcessing={isProcessing}
                  timeLeft={timeLeft}
                  onLaneStep={moveCartByStep}
                  onPointerLane={moveCartToPointerLane}
                  onSceneryInit={initScenery}
                  t={t}
                />
              ) : (
                <canvas
                  ref={canvasRef}
                  width={getCanvasLogicalSize(activeGame).width}
                  height={getCanvasLogicalSize(activeGame).height}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onTouchStart={handleMouseDown}
                  onTouchMove={handleMouseMove}
                  onTouchEnd={handleMouseUp}
                  className="block h-full w-full"
                  style={{ cursor: IS_TOUCH_DEVICE ? "default" : "none", touchAction: "none" }}
                />
              )}
            </div>
          </div>
    <GameTurnstileModal
      open={turnstileOpen}
      onCancel={() => {
        setTurnstileOpen(false);
        pendingStartSocketRef.current = null;
        toast.message("Verificação cancelada");
        navigate("/games", { replace: true });
      }}
      onSolved={(token) => {
        setTurnstileOpen(false);
        const sock = pendingStartSocketRef.current;
        pendingStartSocketRef.current = null;
        void (async () => {
          await submitGameTurnstilePass(token);
          if (sock) {
            sock.emit("game:start", gameStartAntibotPayload(serverSlug, { cfTurnstileToken: token }));
          }
        })();
      }}
    />
    </div>
  );
}

