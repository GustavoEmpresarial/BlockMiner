/**
 * Games realtime dispatcher. Ported from legacy/server/src/socket/registerGamesSocketHandlers.ts
 * (954 lines) — `crypto-memory` ("Memory Sync"), `crypto-match-3` ("Power Match"), `block-stack`
 * ("Block Stack"), `sky-runner` ("Sky Runner") and `cart-rush` ("Cart Rush") are all ported.
 *
 * cart-rush is the only minigame with a concurrent per-session `setInterval` tick loop
 * (CART_TICK_MS = 200ms) driving lane/collision/health/spawn/difficulty state server-side —
 * `tickCartRush()` below, pure math extracted to games.cartrush.pure.ts (ported from legacy's
 * gamesSocket.cart.ts + the inline tick math in `tickCartRush()`). The timer is stored on
 * `state.cartTickTimer` and cleared by `clearMemoryMismatchTimer` (shared cleanup helper, despite
 * the name) from every exit path: game:start (superseding a stale session), finishGame, and
 * disconnect. `finishGame`'s playTimeMs uses `max(wallClock, state.elapsedMs)` and anti-cheat uses
 * `evaluateCartRushTrust` (tick-physics-aware) instead of the flat-floor `evaluateTrust` — exactly
 * mirroring legacy's gameSlug-branch in its finishGame.
 *

 * block-stack is server-authoritative without a tick loop: the server records
 * `blockStartedAt`/`currentTravelMs` at `game:start`/each successful drop and recomputes the
 * moving block's logical position from elapsed time only when a `drop` action arrives (pure math
 * in `games.pure.ts` — `stackBlockLeft` / `resolveStackDrop`), exactly mirroring legacy's
 * `handleBlockStackDrop`.
 *
 * sky-runner is client-authoritative-with-server-validation, also without a tick loop: the server
 * ships a crypto-random seed + physics constants at `game:start`, the client simulates locally,
 * and the server only rate-limits `flap`, and validates `checkpoint`/`finish` timing against the
 * physics-minimum floor (`skyMinElapsedMsForPipes` in `games.pure.ts`) — exactly mirroring
 * legacy's `handleSkyRunnerFlap`/`handleSkyRunnerCheckpoint`/`handleSkyRunnerFinish`.
 *
 * Reuses (does not duplicate) the already-ported shared helpers in this module:
 *  - games.session-lock.ts   → one active session per (userId, gameSlug)
 *  - games.cooldown.ts       → DB-backed progressive cooldown
 *  - games.anti-cheat.ts     → evaluateTrust (score/timing trust scoring)
 *  - games.burst-guard.ts    → flagMinigameBurstIfNeeded (+ reward reject on burst)
 *  - games.antibot-gate.ts   → deny reward on high antibot score / automation
 *
 * Reward crediting mirrors game2048.service.ts exactly: `prisma.userPowerGame.create(...)`
 * directly (game2048 does the same — there is no separate wallet/boosts "credit hashrate" API to
 * call through; `userPowerGame` rows ARE the temporary-hashrate credit ledger). No balance logic
 * is duplicated here.
 *
 * Post-game hooks wired for real: notifyMiniPassGamePlayed (mini-pass/), notifyDailyTaskGamePlayed
 * (tasks/), recordTournamentAction (tournaments/). Mining hashrate resync
 * (`syncUserBaseHashRate` + live engine reload) is wired too, same as legacy's finishGame.
 *
 * Deviation: legacy's Brazil-anchored `getBrazilDateKeyAliases()` check-in lookup is replaced
 * with `getUtcDayKey`/`getUtcDayKeyLookupKeys` (shared/calendar/utcCalendar.ts) — same
 * substitution game2048.service.ts already made, for the same site-wide UTC-boundary reason.
 */
import crypto from "node:crypto";
import type { Server, Socket } from "socket.io";
import prisma from "../../core/database/prisma.js";
import { logger as rootLogger } from "../../core/logger/index.js";
import { verifyAccessToken } from "../../shared/security/authTokens.js";
import { getAuthUserById } from "../../shared/security/authUser.js";
import { isTokenSessionCurrent } from "../../shared/security/sessionVersion.js";
import { getTokenFromRequest } from "../../shared/security/token.js";
import { getUtcDayKey, getUtcDayKeyLookupKeys } from "../../shared/calendar/utcCalendar.js";
import { syncUserBaseHashRate, miningEngine as engine } from "../mining/index.js";
import { notifyMiniPassGamePlayed } from "../mini-pass/index.js";
import { notifyDailyTaskGamePlayed } from "../tasks/index.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import { checkCooldown, recordFinish } from "./games.cooldown.js";
import { evaluateTrust, evaluateCartRushTrust } from "./games.anti-cheat.js";
import {
  tryAcquireUserGameSession,
  releaseUserGameSession,
  releaseAllUserGameSessionsForSocket,
  clearStaleUserGameSession,
} from "./games.session-lock.js";
import { burstRejectCooldownSec, flagMinigameBurstIfNeeded } from "./games.burst-guard.js";
import { loadAndEvaluateGameRewardGate } from "./games.antibot-gate.js";
import { parseGameStartPayload } from "./games.start-payload.js";
import { gameFinishDenyMessage, isSecurityRejectCode } from "./games.finish-messages.js";
import { assertGameTurnstileForReward } from "./games.turnstile-gate.js";
import { secureShuffle, generateStableBoard, findMatches, processCascades, type Match3Coord } from "./games.match3.pure.js";
import {
  readMatch3GridCoord,
  readClampedNumber,
  skyMinElapsedMsForPipes,
  type SkyGeom,
} from "./games.pure.js";
import {
  CART_LANES,
  CART_MAX_HEALTH,
  CART_TARGET_SCORE,
  CART_TIME_LIMIT_SECONDS,
  CART_TICK_MS,
  CART_BASE_SPEED,
  cartDifficultyFactor,
  cartRoadSpeed,
  cartRushScore,
  advanceCartRushEvents,
  resolveCartRushCollisions,
  advanceCartRushSpawn,
  type CartRushEvent,
} from "./games.cartrush.pure.js";
import { getMemoryMismatchRevealMs } from "./games.memory.constants.js";

const logger = rootLogger.child("GamesSocket");

const GAME_POWER_DAYS = Number(process.env.GAME_POWER_DAYS) || 7;
/** Time for the client flip-open animation to settle so both cards are fully visible. */
const MEMORY_FLIP_OPEN_SETTLE_MS = 170;
const MEMORY_MISMATCH_HOLD_MS = getMemoryMismatchRevealMs();
const MEMORY_MISMATCH_TOTAL_MS = MEMORY_FLIP_OPEN_SETTLE_MS + MEMORY_MISMATCH_HOLD_MS;

const SYMBOLS = ["bitcoin", "ethereum", "solana", "binance-coin", "cardano", "polkadot", "dogecoin", "polygon"];

/** Ported games only. Do not add a slug here without a real handler — see file header. */
const GAME_NAMES: Record<string, string> = {
  "crypto-memory": "Memory Sync",
  "crypto-match-3": "Power Match",
  "sky-runner": "Sky Runner",
  "cart-rush": "Cart Rush",
};

// ─── Sky Runner constants (ported from legacy gamesSocket.ts) ────────────────
const SKY_WORLD_W = 600;
const SKY_WORLD_H = 800;
const SKY_PLANE_X = 140;
const SKY_PLANE_RADIUS = 38;
const SKY_GRAVITY = 1500;
const SKY_FLAP_VY = -480;
const SKY_MAX_VY = 800;
const SKY_MIN_FLAP_INTERVAL_MS = 80;
const SKY_PIPE_W = 90;
const SKY_PIPE_GAP = 250;
const SKY_PIPE_GAP_MIN = 190;
const SKY_PIPE_SPAWN_DX = 300;
const SKY_SCROLL_SPEED_BASE = 170;
const SKY_SCROLL_SPEED_MAX = 260;
const SKY_DIFFICULTY_RAMP_MS = 60000;
const SKY_TARGET_PIPES = 15;
const SKY_PIPE_MARGIN = 90;
const SKY_LIVES = 3;
const SKY_INVULN_MS = 1500;
const SKY_CHECKPOINT_EVERY_PIPES = 5;
const SKY_GEOM: SkyGeom = {
  worldW: SKY_WORLD_W,
  planeX: SKY_PLANE_X,
  spawnDx: SKY_PIPE_SPAWN_DX,
  maxSpeed: SKY_SCROLL_SPEED_MAX,
};

type MemoryCard = { id: number; symbol: string; isFlipped: boolean; isMatched: boolean };

/** Per-socket game session state; extra fields vary by `slug`. */
type GameSessionState = {
  gameId: number;
  slug: string;
  userId: number;
  score: number;
  isFinished: boolean;
  startTime: number;
  lastUpdate: number;
  board?: MemoryCard[] | string[][];
  flipped?: MemoryCard[];
  memoryMismatchTimeout?: ReturnType<typeof setTimeout> | null;
  /** Client IronDome / webdriver hint from game:start. */
  automationDetected?: boolean;
  /** Turnstile token captured at game:start for every-N reward gate. */
  cfTurnstileToken?: string;
  /** Count of accepted game:action events (anti-cheat flood). */
  actionCount?: number;
  // sky-runner
  seed?: string;
  lives?: number;
  pipesPassed?: number;
  lastCheckpointMs?: number;
  lastFlapAt?: number;
  // cart-rush
  lane?: number;
  health?: number;
  events?: CartRushEvent[];
  distance?: number;
  btcCount?: number;
  elapsedMs?: number;
  roadSpeed?: number;
  spawnCooldownMs?: number;
  cartTickTimer?: ReturnType<typeof setInterval> | null;
};

const GAME_SESSIONS = new Map<string, GameSessionState>();

function getMemoryBoard(s: GameSessionState): MemoryCard[] {
  const b = s.board;
  return Array.isArray(b) ? (b as MemoryCard[]) : [];
}

function getMemoryFlipped(s: GameSessionState): MemoryCard[] {
  const f = s.flipped;
  return Array.isArray(f) ? f : [];
}

function clearMemoryMismatchTimer(state: GameSessionState | undefined): void {
  if (!state) return;
  if (state.memoryMismatchTimeout) {
    clearTimeout(state.memoryMismatchTimeout);
    state.memoryMismatchTimeout = null;
  }
  if (state.cartTickTimer) {
    clearInterval(state.cartTickTimer);
    state.cartTickTimer = null;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function registerGamesSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    socket.on("game:start", async (gameSlug: unknown) => {
      try {
        const started = parseGameStartPayload(gameSlug, GAME_NAMES);
        const slug = started.slug;
        if (!slug) return socket.emit("game:error", { code: "unknown_game" });
        if (started.automationDetected) {
          return socket.emit("game:error", { code: "antibot_automation" });
        }

        const prev = GAME_SESSIONS.get(socket.id);
        if (prev && !prev.isFinished) {
          return socket.emit("game:error", { code: "session_active" });
        }
        if (prev) {
          clearMemoryMismatchTimer(prev);
          GAME_SESSIONS.delete(socket.id);
        }

        const requestLike = { headers: (socket.request?.headers || {}) as Record<string, string | string[] | undefined> };
        const authToken = getTokenFromRequest(requestLike as never);
        let payload: ReturnType<typeof verifyAccessToken> | null = null;
        try {
          payload = authToken ? verifyAccessToken(authToken) : null;
        } catch {
          payload = null;
        }
        const userId = Number(payload && typeof payload !== "string" ? payload.sub : NaN);

        if (!userId) return socket.emit("game:error", { code: "invalid_session" });

        const gameUser = await getAuthUserById(userId);
        if (!gameUser || !isTokenSessionCurrent(payload, gameUser.sessionVersion)) {
          return socket.emit("game:error", { code: "SESSION_SUPERSEDED" });
        }

        clearStaleUserGameSession(userId, slug, (holderSocketId) => {
          const live = GAME_SESSIONS.get(holderSocketId);
          const sock = io.sockets.sockets.get(holderSocketId);
          return Boolean(sock?.connected && live && !live.isFinished);
        });
        if (!tryAcquireUserGameSession(userId, slug, socket.id)) {
          return socket.emit("game:error", { code: "game_already_active" });
        }
        const releaseLock = () => releaseUserGameSession(userId, slug, socket.id);

        const cooldownResult = await checkCooldown(userId, slug);
        if (cooldownResult) {
          releaseLock();
          return socket.emit("game:error", { code: "cooldown", seconds: cooldownResult.remainingSeconds });
        }

        const gameName = GAME_NAMES[slug];
        const game = await prisma.game.upsert({
          where: { slug },
          create: { name: gameName, slug, isActive: true },
          update: {},
        });
        if (!game.isActive) {
          releaseLock();
          return socket.emit("game:error", { code: "game_paused" });
        }

        const initialState: GameSessionState = {
          gameId: Number(game.id),
          slug,
          userId: Number(userId),
          score: 0,
          isFinished: false,
          startTime: Date.now(),
          lastUpdate: Date.now(),
          automationDetected: started.automationDetected,
          cfTurnstileToken: started.cfTurnstileToken || "",
          actionCount: 0,
        };

        if (slug === "crypto-memory") {
          initialState.board = secureShuffle([...SYMBOLS, ...SYMBOLS]).map((symbol, id) => ({
            id,
            symbol,
            isFlipped: false,
            isMatched: false,
          }));
          initialState.flipped = [];
          socket.emit("game:started", {
            game: slug,
            board: getMemoryBoard(initialState).map((c) => ({ id: c.id, isFlipped: false, isMatched: false })),
            score: 0,
          });
        } else if (slug === "crypto-match-3") {
          initialState.board = generateStableBoard();
          socket.emit("game:started", { game: slug, board: initialState.board, score: 0 });
        } else if (slug === "cart-rush") {
          initialState.lane = 1;
          initialState.health = CART_MAX_HEALTH;
          initialState.events = [];
          initialState.distance = 0;
          initialState.btcCount = 0;
          initialState.elapsedMs = 0;
          initialState.roadSpeed = CART_BASE_SPEED;
          initialState.spawnCooldownMs = 450;
          initialState.cartTickTimer = setInterval(() => tickCartRush(io, socket, initialState), CART_TICK_MS);
          socket.emit("game:started", {
            game: slug,
            lane: initialState.lane,
            lanes: CART_LANES,
            health: initialState.health,
            targetScore: CART_TARGET_SCORE,
            score: 0,
            distance: 0,
            btcCount: 0,
            roadSpeed: initialState.roadSpeed,
            timeLimitSeconds: CART_TIME_LIMIT_SECONDS,
          });
        } else if (slug === "sky-runner") {
          const seed = crypto.randomBytes(16).toString("hex");
          initialState.seed = seed;
          initialState.lives = SKY_LIVES;
          initialState.pipesPassed = 0;
          initialState.lastCheckpointMs = 0;
          initialState.lastFlapAt = 0;
          socket.emit("game:started", {
            game: slug,
            seed,
            worldW: SKY_WORLD_W,
            worldH: SKY_WORLD_H,
            planeX: SKY_PLANE_X,
            planeRadius: SKY_PLANE_RADIUS,
            pipeW: SKY_PIPE_W,
            pipeGap: SKY_PIPE_GAP,
            pipeGapMin: SKY_PIPE_GAP_MIN,
            pipeSpawnDx: SKY_PIPE_SPAWN_DX,
            pipeMargin: SKY_PIPE_MARGIN,
            scrollSpeedBase: SKY_SCROLL_SPEED_BASE,
            scrollSpeedMax: SKY_SCROLL_SPEED_MAX,
            difficultyRampMs: SKY_DIFFICULTY_RAMP_MS,
            gravity: SKY_GRAVITY,
            flapVy: SKY_FLAP_VY,
            maxVy: SKY_MAX_VY,
            minFlapIntervalMs: SKY_MIN_FLAP_INTERVAL_MS,
            invulnMs: SKY_INVULN_MS,
            targetPipes: SKY_TARGET_PIPES,
            lives: SKY_LIVES,
            maxLives: SKY_LIVES,
            score: 0,
            checkpointEveryPipes: SKY_CHECKPOINT_EVERY_PIPES,
          });
        }

        GAME_SESSIONS.set(socket.id, initialState);
      } catch (error: unknown) {
        releaseAllUserGameSessionsForSocket(socket.id);
        logger.error("Game Start Error", { error: errMsg(error) });
        socket.emit("game:error", { code: "start_failed" });
      }
    });

    socket.on("game:action", (action: unknown) => {
      if (!action || typeof action !== "object" || Array.isArray(action)) return;
      const state = GAME_SESSIONS.get(socket.id);
      if (!state || state.isFinished) return;
      state.actionCount = (Number(state.actionCount) || 0) + 1;
      state.lastUpdate = Date.now();
      const a = action as { type?: unknown; cardId?: unknown; from?: unknown; to?: unknown };

      if (state.slug === "crypto-memory" && a.type === "flip") {
        const board = getMemoryBoard(state);
        if (!Array.isArray(state.flipped)) state.flipped = [];
        const flipped = getMemoryFlipped(state);
        if (flipped.length >= 2) return;
        const cardId = Number(a.cardId);
        if (!Number.isInteger(cardId) || cardId < 0 || cardId >= board.length) return;
        const card = board.find((c) => c.id === cardId);
        if (!card || card.isFlipped || card.isMatched) return;

        card.isFlipped = true;
        flipped.push(card);
        state.flipped = flipped;
        socket.emit("game:card_flipped", { id: card.id, symbol: card.symbol });

        if (flipped.length === 2) {
          const [c1, c2] = flipped;
          if (c1.symbol === c2.symbol) {
            c1.isMatched = true;
            c2.isMatched = true;
            state.score += 250;
            state.flipped = [];
            socket.emit("game:match", { ids: [c1.id, c2.id], score: state.score });
            if (board.every((c) => c.isMatched)) void finishGame(io, socket, state, true);
          } else {
            const id1 = c1.id;
            const id2 = c2.id;
            clearMemoryMismatchTimer(state);
            state.memoryMismatchTimeout = setTimeout(() => {
              state.memoryMismatchTimeout = null;
              const live = GAME_SESSIONS.get(socket.id);
              if (!live || live !== state || live.isFinished || live.slug !== "crypto-memory") return;
              const liveBoard = getMemoryBoard(live);
              const card1 = liveBoard.find((c) => c.id === id1);
              const card2 = liveBoard.find((c) => c.id === id2);
              if (!card1 || !card2 || card1.isMatched || card2.isMatched) {
                live.flipped = [];
                return;
              }
              card1.isFlipped = false;
              card2.isFlipped = false;
              live.flipped = [];
              socket.emit("game:mismatch", { ids: [id1, id2] });
            }, MEMORY_MISMATCH_TOTAL_MS);
          }
        }
      } else if (state.slug === "crypto-match-3" && a.type === "swap") {
        const from = readMatch3GridCoord(a.from);
        const to = readMatch3GridCoord(a.to);
        if (!from || !to) return;
        handleMatch3Swap(io, socket, state, from, to);
      } else if (state.slug === "cart-rush" && a.type === "lane") {
        const lane = Number((action as { lane?: unknown }).lane);
        if (!Number.isInteger(lane) || lane < 0 || lane >= CART_LANES) return;
        state.lane = lane;
        socket.emit("game:cart_lane", { lane: state.lane });
      } else if (state.slug === "sky-runner") {
        if (a.type === "flap") {
          handleSkyRunnerFlap(state);
        } else if (a.type === "checkpoint") {
          handleSkyRunnerCheckpoint(io, socket, state, action as Record<string, unknown>);
        } else if (a.type === "finish") {
          handleSkyRunnerFinish(io, socket, state, action as Record<string, unknown>);
        }
      }
    });

    socket.on("game:end", () => {
      const state = GAME_SESSIONS.get(socket.id);
      if (state && !state.isFinished) {
        void finishGame(io, socket, state, false);
      }
    });

    socket.on("disconnect", () => {
      const s = GAME_SESSIONS.get(socket.id);
      if (s && !s.isFinished) {
        releaseUserGameSession(Number(s.userId), String(s.slug || ""), socket.id);
      }
      releaseAllUserGameSessionsForSocket(socket.id);
      clearMemoryMismatchTimer(s);
      GAME_SESSIONS.delete(socket.id);
    });
  });
}

function handleMatch3Swap(
  io: Server,
  socket: Socket,
  state: GameSessionState,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) return;

  const board = state.board as string[][];
  const temp = board[from.y][from.x];
  board[from.y][from.x] = board[to.y][to.x];
  board[to.y][to.x] = temp;

  let matches = findMatches(board);
  if (matches.length === 0) {
    board[to.y][to.x] = board[from.y][from.x];
    board[from.y][from.x] = temp;
    socket.emit("game:invalid_swap");
    return;
  }

  let totalPoints = 0;
  const cleared: Match3Coord[] = [];
  while (matches.length > 0) {
    totalPoints += matches.length * 20;
    cleared.push(...matches);
    processCascades(board, matches);
    matches = findMatches(board);
  }

  state.score += totalPoints;
  socket.emit("game:board_update", { board: state.board, score: state.score, cleared });
  if (state.score >= 1500) void finishGame(io, socket, state, true);
}

// ─── Sky Runner: server validates client-simulated Flappy-style airplane ─────
// The server's only role for `flap` is rate-limit telemetry — the client runs the actual physics.
// `checkpoint`/`finish` are validated against the physics-minimum floor (skyMinElapsedMsForPipes)
// so a client cannot report more pipes passed than physically possible in the elapsed time.
function handleSkyRunnerFlap(state: GameSessionState): void {
  const now = Date.now();
  if (now - (state.lastFlapAt || 0) < SKY_MIN_FLAP_INTERVAL_MS) return;
  state.lastFlapAt = now;
}

function handleSkyRunnerCheckpoint(io: Server, socket: Socket, state: GameSessionState, action: Record<string, unknown>): void {
  const pipesPassed = readClampedNumber(action.pipesPassed, 0, SKY_TARGET_PIPES);
  const elapsedMs = readClampedNumber(action.elapsedMs, 0, 30 * 60 * 1000);
  const lives = readClampedNumber(action.lives, 0, SKY_LIVES);
  const score = readClampedNumber(action.score, 0, SKY_TARGET_PIPES * 1000);
  if (pipesPassed === null || elapsedMs === null || lives === null || score === null) return;

  if (pipesPassed < (Number(state.pipesPassed) || 0)) return;

  const minMs = skyMinElapsedMsForPipes(pipesPassed, SKY_GEOM);
  if (elapsedMs < minMs) {
    logger.warn(`sky-runner: checkpoint rejected (impossible timing) userId=${state.userId} pipes=${pipesPassed} elapsedMs=${elapsedMs} minMs=${minMs}`);
    socket.emit("game:error", { code: "checkpoint_rejected" });
    void finishGame(io, socket, state, false, "sky_cheat_timing");
    return;
  }

  state.pipesPassed = pipesPassed;
  state.lastCheckpointMs = elapsedMs;
  state.lives = lives;
  // Server-derived score only — ignore client points (bot can forge action.score).
  state.score = pipesPassed;
  socket.emit("sky:checkpoint_ack", { pipesPassed, lives });
}

function handleSkyRunnerFinish(io: Server, socket: Socket, state: GameSessionState, action: Record<string, unknown>): void {
  const pipesPassed = readClampedNumber(action.pipesPassed, 0, SKY_TARGET_PIPES);
  const elapsedMs = readClampedNumber(action.elapsedMs, 0, 30 * 60 * 1000);
  const score = readClampedNumber(action.score, 0, SKY_TARGET_PIPES * 1000);
  if (pipesPassed === null || elapsedMs === null || score === null) {
    void finishGame(io, socket, state, false, "sky_finish_invalid");
    return;
  }

  const minMs = skyMinElapsedMsForPipes(pipesPassed, SKY_GEOM);
  if (elapsedMs < minMs) {
    logger.warn(`sky-runner: finish rejected (impossible timing) userId=${state.userId} pipes=${pipesPassed} elapsedMs=${elapsedMs} minMs=${minMs}`);
    void finishGame(io, socket, state, false, "sky_cheat_timing");
    return;
  }

  state.pipesPassed = pipesPassed;
  state.lastCheckpointMs = elapsedMs;
  state.score = pipesPassed;

  const won = pipesPassed >= SKY_TARGET_PIPES;
  void finishGame(io, socket, state, won, won ? "sky_won" : "sky_lost");
}

// ─── Cart Rush: server-ticked (setInterval) obstacle/coin road ───────────────
// The only minigame with a continuous server tick loop. `state.cartTickTimer` is started at
// game:start and MUST be cleared on every exit path — clearMemoryMismatchTimer (despite the name,
// shared across games since legacy) clears both the memory-mismatch timeout and this interval, and
// is already called from finishGame and the `disconnect` handler, so no separate cleanup is needed
// here. Pure per-tick math (spawn/advance/collision/difficulty) lives in games.cartrush.pure.ts.
function tickCartRush(io: Server, socket: Socket, state: GameSessionState): void {
  const live = GAME_SESSIONS.get(socket.id);
  if (!live || live !== state || state.isFinished || state.slug !== "cart-rush") return;

  state.distance = (Number(state.distance) || 0) + 10;
  state.elapsedMs = (Number(state.elapsedMs) || 0) + CART_TICK_MS;
  const difficulty = cartDifficultyFactor(state.elapsedMs);
  state.roadSpeed = cartRoadSpeed(difficulty);

  const advanced = advanceCartRushEvents(state.events || [], state.roadSpeed);
  const { survivors, hit, healthDelta, btcDelta } = resolveCartRushCollisions(advanced, Number(state.lane) || 0);
  state.health = (Number(state.health) || 0) + healthDelta;
  state.btcCount = (Number(state.btcCount) || 0) + btcDelta;

  const spawned = advanceCartRushSpawn(survivors, Number(state.spawnCooldownMs) || 0, state.distance, difficulty);
  state.events = spawned.events;
  state.spawnCooldownMs = spawned.spawnCooldownMs;

  state.score = cartRushScore(state.distance, state.btcCount);

  socket.emit("game:cart_update", {
    lane: state.lane,
    score: state.score,
    health: state.health,
    distance: state.distance,
    btcCount: Number(state.btcCount) || 0,
    events: state.events,
    hit,
    targetScore: CART_TARGET_SCORE,
    roadSpeed: state.roadSpeed,
    difficulty,
  });

  if ((state.score || 0) >= CART_TARGET_SCORE) {
    void finishGame(io, socket, state, true);
  } else if ((state.health || 0) <= 0) {
    void finishGame(io, socket, state, false, "cart_crashed");
  }
}

async function finishGame(
  io: Server,
  socket: Socket,
  state: GameSessionState,
  success: boolean,
  failureCode = "session_ended",
): Promise<void> {
  if (state.isFinished) return;
  clearMemoryMismatchTimer(state);
  state.isFinished = true;
  GAME_SESSIONS.delete(socket.id);

  const wallPlayTimeMs = Date.now() - state.startTime;
  const userId = Number(state.userId);
  const gameSlug = String(state.slug || "");
  releaseUserGameSession(userId, gameSlug, socket.id);
  // cart-rush is tick-driven, not wall-clock-driven: a client that starts the socket connection
  // and only issues lane actions once ticks are already flowing can have a wallPlayTimeMs that
  // undercounts real elapsed tick time in edge cases (e.g. reconnect races). elapsedMs is the
  // server's own tick-loop accumulator, so it's the trustworthy floor — mirrors legacy exactly.
  const playTimeMs = gameSlug === "cart-rush" ? Math.max(wallPlayTimeMs, Number(state.elapsedMs) || 0) : wallPlayTimeMs;
  const score = Number(state.score || 0);
  const ip = socket.handshake?.address || socket.request?.socket?.remoteAddress || null;
  const userAgent = (socket.request?.headers?.["user-agent"] as string | undefined) || null;

  if (!success) {
    // Early cheat exits (e.g. sky_cheat_timing) share the same user-facing deny as anti-cheat.
    const earlyCheat =
      failureCode === "sky_cheat_timing" ||
      failureCode === "sky_finish_invalid" ||
      failureCode.startsWith("cheat:") ||
      failureCode.startsWith("anticheat:");
    const messageCode = earlyCheat ? "anti_cheat_timing" : failureCode;
    const message =
      earlyCheat || isSecurityRejectCode(messageCode)
        ? gameFinishDenyMessage(messageCode === "anti_cheat_timing" ? "anti_cheat_timing" : messageCode)
        : undefined;

    prisma.gameSessionLog
      .create({
        data: { userId, gameSlug, gameId: Number(state.gameId) || null, success: false, score, playTimeMs, failReason: failureCode, rewardGranted: false, ip, userAgent },
      })
      .catch(() => {});
    prisma.auditLog
      .create({
        data: {
          userId,
          action: "MINIGAME_PLAYED_FAILED",
          ip,
          userAgent,
          detailsJson: JSON.stringify({ gameSlug, score, success: false, reason: failureCode, messageCode }),
        },
      })
      .catch(() => {});
    // No tournament / power on any !success path.
    socket.emit("game:finished", {
      success: false,
      messageCode,
      ...(message ? { message } : {}),
      cooldownSeconds: earlyCheat ? 30 : 10,
    });
    return;
  }

  const trust =
    gameSlug === "cart-rush"
      ? evaluateCartRushTrust(playTimeMs, Number(state.distance) || 0, Number(state.btcCount) || 0, score)
      : evaluateTrust(gameSlug, playTimeMs, score, { actionCount: Number(state.actionCount) || 0 });
  if (trust.rejected) {
    logger.warn(`[AntiCheat] Rejected userId=${userId} game=${gameSlug} playTimeMs=${playTimeMs} trustScore=${trust.trustScore} events=${trust.events.join(",")}`);
    prisma.gameSessionLog
      .create({
        data: { userId, gameSlug, gameId: Number(state.gameId) || null, success: false, score, playTimeMs, failReason: `anticheat:${trust.events.join(",")}`, trustScore: trust.trustScore, rewardGranted: false, ip, userAgent },
      })
      .catch(() => {});
    recordFinish(userId, gameSlug).catch(() => {});
    // No tournament / power — anti-cheat reject only.
    socket.emit("game:finished", {
      success: false,
      messageCode: "anti_cheat_timing",
      message: gameFinishDenyMessage("anti_cheat_timing"),
      cooldownSeconds: 30,
    });
    return;
  }

  const antibotGate = await loadAndEvaluateGameRewardGate(prisma, userId, Boolean(state.automationDetected));
  if (!antibotGate.allowed) {
    logger.warn(
      `[AntibotGate] Denied userId=${userId} game=${gameSlug} reason=${antibotGate.reason} score=${antibotGate.riskScore} band=${antibotGate.band}`,
    );
    prisma.gameSessionLog
      .create({
        data: {
          userId,
          gameSlug,
          gameId: Number(state.gameId) || null,
          success: false,
          score,
          playTimeMs,
          failReason: `antibot:${antibotGate.reason || "blocked"}`,
          trustScore: trust.trustScore,
          rewardGranted: false,
          ip,
          userAgent,
        },
      })
      .catch(() => {});
    recordFinish(userId, gameSlug).catch(() => {});
    const messageCode = antibotGate.messageCode || "antibot_blocked";
    // No tournament / power — antibot gate reject only.
    socket.emit("game:finished", {
      success: false,
      messageCode,
      message: gameFinishDenyMessage(messageCode),
      cooldownSeconds: antibotGate.cooldownSeconds,
    });
    return;
  }

  const dayKey = getUtcDayKey(new Date());
  const checkinToday = await prisma.dailyCheckin.findFirst({
    where: { userId, status: "confirmed", checkinDate: { in: getUtcDayKeyLookupKeys(dayKey) } },
    select: { id: true },
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const powerDays = checkinToday ? GAME_POWER_DAYS : 1;
  const rewardCode = powerDays >= GAME_POWER_DAYS ? "full_term" : "short_term";
  const rewardParams = { days: GAME_POWER_DAYS };
  const expiresAt = new Date(Date.now() + powerDays * 24 * 60 * 60 * 1000);

  let burstSuspicious = false;
  try {
    const burst = await flagMinigameBurstIfNeeded(userId, gameSlug, { ip, userAgent, score, playTimeMs });
    burstSuspicious = burst.suspicious;
  } catch (err) {
    logger.warn(`minigame burst-guard failed (non-blocking) userId=${userId} game=${gameSlug}: ${errMsg(err)}`);
  }
  if (burstSuspicious) {
    logger.warn(`[BurstGuard] Rejected reward userId=${userId} game=${gameSlug}`);
    prisma.gameSessionLog
      .create({
        data: {
          userId,
          gameSlug,
          gameId: Number(state.gameId) || null,
          success: false,
          score,
          playTimeMs,
          failReason: "burst:pattern",
          trustScore: trust.trustScore,
          rewardGranted: false,
          ip,
          userAgent,
        },
      })
      .catch(() => {});
    recordFinish(userId, gameSlug).catch(() => {});
    // No tournament / power — burst reject only.
    socket.emit("game:finished", {
      success: false,
      messageCode: "anti_cheat_burst",
      message: gameFinishDenyMessage("anti_cheat_burst"),
      cooldownSeconds: burstRejectCooldownSec(),
    });
    return;
  }

  const turnstileGate = await assertGameTurnstileForReward(
    prisma,
    userId,
    state.cfTurnstileToken,
    ip || undefined,
  );
  if (!turnstileGate.ok) {
    const messageCode = turnstileGate.code === "CAPTCHA_FAILED" ? "captcha_failed" : "captcha_required";
    logger.warn(`[TurnstileGate] Denied userId=${userId} game=${gameSlug} code=${turnstileGate.code}`);
    prisma.gameSessionLog
      .create({
        data: {
          userId,
          gameSlug,
          gameId: Number(state.gameId) || null,
          success: false,
          score,
          playTimeMs,
          failReason: `turnstile:${turnstileGate.code}`,
          trustScore: trust.trustScore,
          rewardGranted: false,
          ip,
          userAgent,
        },
      })
      .catch(() => {});
    recordFinish(userId, gameSlug).catch(() => {});
    socket.emit("game:finished", {
      success: false,
      messageCode,
      message: gameFinishDenyMessage(messageCode),
      cooldownSeconds: 10,
    });
    return;
  }

  try {
    const powerRow = await prisma.userPowerGame.create({
      data: { userId, gameId: Number(state.gameId), hashRate: 25.0, playedAt: new Date(), expiresAt },
    });

    await recordFinish(userId, gameSlug);

    prisma.gameSessionLog
      .create({
        data: { userId, gameSlug, gameId: Number(state.gameId) || null, success: true, score, playTimeMs, trustScore: trust.trustScore, rewardGranted: true, ip, userAgent },
      })
      .catch(() => {});

    notifyMiniPassGamePlayed(userId, { userPowerGameId: powerRow.id, gameSlug }).catch(() => {});
    notifyDailyTaskGamePlayed(userId, { userPowerGameId: powerRow.id, gameSlug }).catch(() => {});
    void recordTournamentAction({
      userId,
      provider: TOURNAMENT_ACTION_PROVIDER.MINIGAME,
      actionCount: 1,
      executedAtUTC: powerRow.playedAt instanceof Date ? powerRow.playedAt : new Date(),
      providerEventId: `upg:${powerRow.id}`,
      metadata: { gameSlug, userPowerGameId: powerRow.id, score },
    }).catch((err) => {
      logger.warn(`tournament minigame action failed userId=${userId} upg=${powerRow.id}: ${errMsg(err)}`);
    });

    prisma.auditLog
      .create({
        data: {
          userId,
          action: "MINIGAME_PLAYED_REWARD",
          ip,
          userAgent,
          detailsJson: JSON.stringify({ gameSlug, score, success: true, rewardHashRate: 25, rewardDays: powerDays, userPowerGameId: powerRow.id }),
        },
      })
      .catch(() => {});

    try {
      const total = await syncUserBaseHashRate(userId);
      const miner = engine.miners.get(userId.toString());
      if (miner) miner.baseHashRate = total;
    } catch (err) {
      logger.warn(`minigame hashrate sync failed userId=${userId}: ${errMsg(err)}`);
    }

    let cooldownSeconds = 10;
    try {
      const cooldownResult = await checkCooldown(userId, gameSlug);
      cooldownSeconds = cooldownResult?.remainingSeconds ?? 10;
    } catch (err) {
      logger.warn(`minigame cooldown lookup failed userId=${userId}: ${errMsg(err)}`);
    }

    socket.emit("game:finished", { success: true, rewardCode, rewardParams, cooldownSeconds });
    socket.emit("machines:update");
  } catch (e) {
    logger.error(`minigame reward grant failed userId=${userId} game=${gameSlug}: ${errMsg(e)}`);
    socket.emit("game:finished", { success: false, messageCode: "reward_grant_failed", cooldownSeconds: 10 });
  }
}
