import type { getMatch3GridLayout, getMemoryGridLayout } from "../../../games/minerGamesLayout";
import type { CRYPTO_ICONS } from '../../lib/cryptoGameIcons';

export type CryptoIconKey = keyof typeof CRYPTO_ICONS;
export type ActiveGame = "memory" | "match-3" | "cart" | "sky" | null;

export type MemoryBoardCard = {
  id: number;
  symbol?: string | null;
  isFlipped?: boolean;
  isMatched?: boolean;
};

export type Match3Piece = {
  symbol: string;
  x: number;
  y: number;
  visualX: number;
  visualY: number;
  scale?: number;
};

export type Match3Cell = { cx: number; cy: number };

/** Forward swap uses fx,fy,tx,ty; invalid_swap replay uses rx,ry,rfx,rfy only. */
export type SwapAnim = {
  startTime: number;
  duration: number;
  fx?: number;
  fy?: number;
  tx?: number;
  ty?: number;
  rx?: number;
  ry?: number;
  rfx?: number;
  rfy?: number;
} | null;

export type CartEventVariant = { body?: string; accent?: string; glow?: string };

export type CartServerEvent = {
  id?: string;
  lane?: number;
  progress?: number;
  speed?: number;
  kind?: string;
  variant?: CartEventVariant;
  /** Snapshot of `progress` at the last server update; used to smoothly lerp visual position. */
  serverProgress?: number;
};

export type SceneryItem = {
  x: number;
  y: number;
  speedFactor: number;
  size: number;
  type: "tree" | "pole" | "mountain";
};

export type CartStateRef = {
  lane: number;
  renderLane: number;
  steer: number;
  lanes: number;
  health: number;
  score: number;
  events: CartServerEvent[];
  targetScore: number;
  distance: number;
  btcCount: number;
  hit: CartServerEvent | null;
  roadSpeed: number;
  roadOffset: number;
  lastServerUpdateAt: number;
  lastFrameAt: number;
  difficulty: number;
  localEvents?: CartServerEvent[];
  lastProcessedUpdate?: number;
  physX?: number;
  physVx?: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
};

export type CardFlipAnim = { startTime: number; duration: number; opening: boolean };

export type GameStartedMemory = {
  game: "crypto-memory";
  board: Array<{ id: number; isFlipped?: boolean; isMatched?: boolean; symbol?: string }>;
  score?: number;
};

export type GameStartedMatch3 = {
  game: "crypto-match-3";
  board: string[][];
  score?: number;
};

export type GameStartedCart = {
  game: "cart-rush";
  lane?: number;
  lanes?: number;
  health?: number;
  score?: number;
  targetScore?: number;
  distance?: number;
  btcCount?: number;
  roadSpeed?: number;
  timeLimitSeconds?: number;
};

export type GameStartedStack = {
  game: "block-stack";
  target: number;
  playWidth: number;
  blocksPlaced: number;
  score?: number;
  block: { width: number; travelMs: number; startedAt: number };
  base: { leftPx: number; width: number };
};

export type GameStartedSky = {
  game: "sky-runner";
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
  score?: number;
};

export type GameStartedPayload =
  | GameStartedMemory
  | GameStartedMatch3
  | GameStartedCart
  | GameStartedStack
  | GameStartedSky;

export type MemoryGridLayout = ReturnType<typeof getMemoryGridLayout>;
export type Match3GridLayout = ReturnType<typeof getMatch3GridLayout>;
