/**
 * Pure cart-rush tick/spawn/difficulty logic. Ported from
 * legacy/server/src/socket/gamesSocket.cart.ts (constants + `createCartEvent` +
 * `cartDifficultyFactor`) and the tick math inlined in legacy's `tickCartRush()`
 * (registerGamesSocketHandlers.ts ~line 548). No IO — trivially unit-testable.
 *
 * Cart-rush is the only minigame with a server-side continuous tick loop
 * (setInterval every CART_TICK_MS): lane-changing events ("obstacles"/coins) spawn on
 * a random lane, travel down the road (`progress` 0 → CART_DESPAWN_PROGRESS), and are
 * resolved for collision/collection exactly once when they cross CART_COLLISION_PROGRESS
 * in the player's current lane. Everything here is pure so the socket handler
 * (games.socket.ts) only owns the setInterval wiring + emits.
 */
import crypto from "node:crypto";
export const CART_LANES = 3;
export const CART_TICK_MS = 200;
export const CART_TARGET_SCORE = 250;
export const CART_TIME_LIMIT_SECONDS = 120;
export const CART_MAX_HEALTH = 3;
export const CART_COLLISION_PROGRESS = 0.7;
export const CART_DESPAWN_PROGRESS = 1.18;
export const CART_DIFFICULTY_RAMP_MS = 90000;
export const CART_BASE_SPEED = 0.35;
export const CART_MAX_SPEED = 0.65;
export const CART_BASE_SPAWN_MS = 1200;
export const CART_MIN_SPAWN_MS = 500;
export const CART_DISTANCE_PER_TICK = 10;
export const CART_COIN_POINTS = 50;
export const CART_ENEMY_VARIANTS = [
    { body: "#f97316", accent: "#fdba74", glow: "rgba(249,115,22,0.45)" },
    { body: "#ef4444", accent: "#fca5a5", glow: "rgba(239,68,68,0.45)" },
    { body: "#fb7185", accent: "#fecdd3", glow: "rgba(251,113,133,0.42)" },
];
/** Ramps 0 → 1 over CART_DIFFICULTY_RAMP_MS of elapsed play time. */
export function cartDifficultyFactor(elapsedMs) {
    const safeElapsed = Math.max(0, Number(elapsedMs) || 0);
    return Math.min(1, safeElapsed / CART_DIFFICULTY_RAMP_MS);
}
/**
 * Spawns a new event at progress 0 on a random lane. 25% coin, 20% cone, 10% barrier,
 * 10% pothole, 35% enemy-car (whose speed scales up with difficulty). Non-enemy-car
 * events carry speed 0 — they travel with the road (state.roadSpeed), resolved in
 * `advanceCartRushEvents`.
 */
export function createCartEvent(distance, difficulty) {
    const rand = Math.random();
    const variant = CART_ENEMY_VARIANTS[crypto.randomInt(0, CART_ENEMY_VARIANTS.length)];
    let kind;
    let speed = CART_BASE_SPEED;
    if (rand < 0.25) {
        kind = "coin";
    }
    else if (rand < 0.45) {
        kind = "cone";
    }
    else if (rand < 0.55) {
        kind = "barrier";
    }
    else if (rand < 0.65) {
        kind = "pothole";
    }
    else {
        kind = "enemy-car";
        const speedRange = CART_MAX_SPEED - CART_BASE_SPEED;
        speed = CART_BASE_SPEED + speedRange * (0.45 + difficulty * 0.4 + Math.random() * 0.18);
    }
    if (kind !== "enemy-car") {
        speed = 0; // moves with the road (state.roadSpeed), applied in advanceCartRushEvents
    }
    return {
        id: `${distance}-${crypto.randomUUID()}`,
        lane: crypto.randomInt(0, CART_LANES),
        kind,
        progress: 0,
        speed,
        variant,
    };
}
/**
 * Advances every event's progress by one tick and drops any that have scrolled past
 * CART_DESPAWN_PROGRESS. Events with speed 0 (non-enemy-car) move at `roadSpeed`.
 */
export function advanceCartRushEvents(events, roadSpeed) {
    const tickSeconds = CART_TICK_MS / 1000;
    return events
        .map((event) => ({
        ...event,
        progress: Number(event.progress || 0) + Number(event.speed || roadSpeed) * tickSeconds,
    }))
        .filter((event) => Number(event.progress || 0) <= CART_DESPAWN_PROGRESS);
}
/**
 * Resolves collisions/collections for events that have crossed CART_COLLISION_PROGRESS in the
 * player's current lane, exactly once per event (`checked` flag prevents double-resolution across
 * ticks while the event keeps traveling toward despawn). Coins in-lane grant +1 btcCount; any other
 * kind in-lane costs 1 health and is reported as `hit` (only the first hit per tick is surfaced,
 * mirroring legacy — multiple simultaneous hits still each apply their health cost).
 */
export function resolveCartRushCollisions(events, lane) {
    let hit = null;
    let healthDelta = 0;
    let btcDelta = 0;
    const survivors = [];
    for (const event of events) {
        if (Number(event.progress || 0) >= CART_COLLISION_PROGRESS && !event.checked) {
            const resolved = { ...event, checked: true };
            if (resolved.lane === lane) {
                if (resolved.kind === "coin") {
                    btcDelta += 1;
                }
                else {
                    healthDelta -= 1;
                    if (!hit)
                        hit = resolved;
                }
                continue; // consumed — does not survive to the next tick
            }
            survivors.push(resolved);
            continue;
        }
        survivors.push(event);
    }
    return { survivors, hit, healthDelta, btcDelta };
}
/** Road speed ramps linearly from CART_BASE_SPEED to CART_MAX_SPEED as difficulty (0..1) grows. */
export function cartRoadSpeed(difficulty) {
    return CART_BASE_SPEED + (CART_MAX_SPEED - CART_BASE_SPEED) * difficulty;
}
/** Score = 1 point per 10 distance units + CART_COIN_POINTS per collected coin. */
export function cartRushScore(distance, btcCount) {
    return Math.floor((Number(distance) || 0) / 10) + (Number(btcCount) || 0) * CART_COIN_POINTS;
}
/**
 * Decrements the spawn cooldown by one tick; when it reaches zero, spawns a new event and resets
 * the cooldown (base spawn interval shrinking with difficulty, plus jitter), clamped to the
 * configured minimum. Mirrors legacy's inline spawn-cooldown block in `tickCartRush`.
 */
export function advanceCartRushSpawn(events, spawnCooldownMs, distance, difficulty) {
    const nextCooldown = Math.max(0, Number(spawnCooldownMs || 0) - CART_TICK_MS);
    if (nextCooldown > 0) {
        return { events, spawnCooldownMs: nextCooldown };
    }
    const nextEvents = [...events, createCartEvent(distance, difficulty)];
    const spawnSpread = CART_BASE_SPAWN_MS - CART_MIN_SPAWN_MS;
    let cooldown = CART_BASE_SPAWN_MS - spawnSpread * difficulty + crypto.randomInt(-90, 140);
    if (cooldown < CART_MIN_SPAWN_MS)
        cooldown = CART_MIN_SPAWN_MS;
    return { events: nextEvents, spawnCooldownMs: cooldown };
}
