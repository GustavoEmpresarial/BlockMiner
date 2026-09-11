import type { GameFlowResolution, GameFlowStat } from "./types";

const STORAGE_KEY = "bm.gameVerify.v1";
/** Drop stale verify handoffs (ms). */
const RECORD_TTL_MS = 600 * 1000;

export type GameVerifyClaim = {
  kind: "game2048";
  sessionId: string;
};

export type GameVerifyRecord = {
  createdAt: number;
  gameKey: string;
  gameLabelKey: string;
  playAgainPath: string;
  stats: GameFlowStat[];
  claim: GameVerifyClaim | null;
  resolution: GameFlowResolution | null;
  cooldownUntil: number | null;
  validatedAt: number | null;
};

export type SaveGameVerifyInput = {
  gameKey: string;
  gameLabelKey: string;
  playAgainPath: string;
  stats: GameFlowStat[];
  claim?: GameVerifyClaim | null;
  resolution?: GameFlowResolution | null;
  cooldownSeconds?: number;
};

export function saveGameVerifyRecord(input: SaveGameVerifyInput): void {
  const cooldownSeconds = Math.max(0, Math.floor(input.cooldownSeconds ?? 0));
  const record: GameVerifyRecord = {
    createdAt: Date.now(),
    gameKey: input.gameKey,
    gameLabelKey: input.gameLabelKey,
    playAgainPath: input.playAgainPath,
    stats: input.stats,
    claim: input.claim ?? null,
    resolution: input.resolution ?? null,
    cooldownUntil: cooldownSeconds > 0 ? Date.now() + cooldownSeconds * 1000 : null,
    validatedAt: null,
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadGameVerifyRecord(): GameVerifyRecord | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameVerifyRecord>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.playAgainPath !== "string"
    ) {
      return null;
    }
    if (Date.now() - parsed.createdAt > RECORD_TTL_MS) {
      clearGameVerifyRecord();
      return null;
    }
    return {
      createdAt: parsed.createdAt,
      gameKey: typeof parsed.gameKey === "string" ? parsed.gameKey : "",
      gameLabelKey: typeof parsed.gameLabelKey === "string" ? parsed.gameLabelKey : "",
      playAgainPath: parsed.playAgainPath,
      stats: Array.isArray(parsed.stats) ? parsed.stats : [],
      claim: parsed.claim ?? null,
      resolution: parsed.resolution ?? null,
      cooldownUntil: typeof parsed.cooldownUntil === "number" ? parsed.cooldownUntil : null,
      validatedAt: typeof parsed.validatedAt === "number" ? parsed.validatedAt : null,
    };
  } catch {
    return null;
  }
}

export function updateGameVerifyRecord(
  patch: Partial<GameVerifyRecord>,
): GameVerifyRecord | null {
  const current = loadGameVerifyRecord();
  if (!current) return null;
  const next = { ...current, ...patch };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearGameVerifyRecord(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
