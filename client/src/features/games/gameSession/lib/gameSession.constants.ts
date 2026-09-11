import { MATCH3_LOGICAL_SIZE, MINER_GAMES_LOGICAL_SIZE } from "../../lib/minerGamesLayout";
import type { ActiveGame } from "./gameSession.types";

export const SOCKET_URL = "/";
export const LOGICAL = MINER_GAMES_LOGICAL_SIZE;
export { MATCH3_LOGICAL_SIZE };
export const CART_LOGICAL_WIDTH = 540;
export const CART_LOGICAL_HEIGHT = 720;
export const CART_TOUCH_SWIPE_THRESHOLD = 26;
export const CART_TARGET_SCORE = 250;
export const CART_TIME_LIMIT_SECONDS = 120;

/** Must match server MEMORY_FLIP_OPEN_SETTLE_MS (~client open animation). */
export const MEMORY_CARD_OPEN_ANIM_MS = 150;
export const MEMORY_CARD_CLOSE_ANIM_MS = 220;
/** How long a wrong pair stays face-up before flipping back (keep in sync with server hold). */
export const MEMORY_MISMATCH_HOLD_MS = 400;

export const SLUG_MAP: Record<string, { game: Exclude<ActiveGame, null>; serverSlug: string }> = {
  "memory": { game: "memory", serverSlug: "crypto-memory" },
  "match-3": { game: "match-3", serverSlug: "crypto-match-3" },
  "cart": { game: "cart", serverSlug: "cart-rush" },
  "sky": { game: "sky", serverSlug: "sky-runner" },
};

export const GAME_LABEL_KEYS: Record<Exclude<ActiveGame, null>, string> = {
  memory: "minerGames.memory_sync_title",
  "match-3": "minerGames.power_match_title",
  cart: "minerGames.cart_rush_title",
  sky: "minerGames.sky_runner_title",
};
