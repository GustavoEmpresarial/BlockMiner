// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
export { gamesRouter } from "./games.routes.js";
export { game2048Router } from "./game2048/game2048.routes.js";
export { tryAcquireUserGameSession, releaseUserGameSession, releaseAllUserGameSessionsForSocket, clearStaleUserGameSession } from "./games.session-lock.js";
export { evaluateTrust, evaluateCartRushTrust } from "./games.anti-cheat.js";
export { checkCooldown, recordFinish, getCooldownSeconds } from "./games.cooldown.js";
export { checkMinigameBurstPattern, flagMinigameBurstIfNeeded } from "./games.burst-guard.js";
export { getMemoryMismatchRevealMs } from "./games.memory.constants.js";
export { registerGamesSocketHandlers } from "./games.socket.js";
export { secureShuffle, generateStableBoard, findMatches, processCascades, MATCH3_SYMBOLS } from "./games.match3.pure.js";
export { parseGameSlug, readMatch3GridCoord, readClampedNumber } from "./games.pure.js";
export { CART_LANES, CART_TICK_MS, CART_TARGET_SCORE, CART_TIME_LIMIT_SECONDS, CART_MAX_HEALTH, CART_COLLISION_PROGRESS, CART_DESPAWN_PROGRESS, CART_DIFFICULTY_RAMP_MS, CART_BASE_SPEED, CART_MAX_SPEED, CART_BASE_SPAWN_MS, CART_MIN_SPAWN_MS, CART_DISTANCE_PER_TICK, CART_COIN_POINTS, cartDifficultyFactor, createCartEvent, advanceCartRushEvents, resolveCartRushCollisions, cartRoadSpeed, cartRushScore, advanceCartRushSpawn, } from "./games.cartrush.pure.js";
