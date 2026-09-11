/** Preloaded car sprites reskinning cart-rush — ported from /home/gustavo/Documentos/carrinho
 * (the "Faixa 3" reference game). Server-authoritative sim/anti-cheat (cart.sim.ts,
 * server games.cartrush.pure.ts) is untouched — this only swaps how events are drawn. */
const SPRITE_BASE = "/games/cartrush";

export const ENEMY_SPRITE_KEYS = ["coupe", "sedan", "sedan-red", "taxi", "truck"] as const;
export type EnemySpriteKey = (typeof ENEMY_SPRITE_KEYS)[number];

const SPRITE_FILES: Record<EnemySpriteKey | "player" | "btc" | "curb", string> = {
  player: `${SPRITE_BASE}/player.png`,
  coupe: `${SPRITE_BASE}/coupe.png`,
  sedan: `${SPRITE_BASE}/sedan.png`,
  "sedan-red": `${SPRITE_BASE}/sedan-red.png`,
  taxi: `${SPRITE_BASE}/taxi.png`,
  truck: `${SPRITE_BASE}/truck.png`,
  btc: `${SPRITE_BASE}/btc.png`,
  curb: `${SPRITE_BASE}/curb.png`,
};

const cache = new Map<string, HTMLImageElement>();

function loadSprite(key: keyof typeof SPRITE_FILES): HTMLImageElement {
  const existing = cache.get(key);
  if (existing) return existing;
  const img = new Image();
  img.src = SPRITE_FILES[key];
  cache.set(key, img);
  return img;
}

/** Ready-to-draw only once the browser has decoded it — callers fall back to a vector
 * shape until then, same pattern the reference game uses. */
export function getCartSprite(key: keyof typeof SPRITE_FILES): HTMLImageElement | null {
  const img = loadSprite(key);
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** Deterministic per-event enemy sprite so the same car doesn't flicker between kinds
 * across frames — hashed from the event id (stable for the event's lifetime). */
export function enemySpriteKeyForEvent(eventId: string): EnemySpriteKey {
  let hash = 0;
  for (let i = 0; i < eventId.length; i++) {
    hash = (hash * 31 + eventId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % ENEMY_SPRITE_KEYS.length;
  return ENEMY_SPRITE_KEYS[idx]!;
}

export function preloadCartSprites(): void {
  (Object.keys(SPRITE_FILES) as Array<keyof typeof SPRITE_FILES>).forEach(loadSprite);
}
