import test from "node:test";
import assert from "node:assert/strict";
import {
  CART_LANES,
  CART_TICK_MS,
  CART_COIN_POINTS,
  CART_COLLISION_PROGRESS,
  CART_DESPAWN_PROGRESS,
  CART_DIFFICULTY_RAMP_MS,
  CART_BASE_SPEED,
  CART_MAX_SPEED,
  CART_BASE_SPAWN_MS,
  CART_MIN_SPAWN_MS,
  CART_ENEMY_VARIANTS,
  cartDifficultyFactor,
  createCartEvent,
  advanceCartRushEvents,
  resolveCartRushCollisions,
  cartRoadSpeed,
  cartRushScore,
  advanceCartRushSpawn,
} from "../../server/modules/games/games.cartrush.pure.ts";

test("cartDifficultyFactor: 0 at start, ramps linearly, clamps at 1", () => {
  assert.equal(cartDifficultyFactor(0), 0);
  assert.equal(cartDifficultyFactor(CART_DIFFICULTY_RAMP_MS / 2), 0.5);
  assert.equal(cartDifficultyFactor(CART_DIFFICULTY_RAMP_MS), 1);
  assert.equal(cartDifficultyFactor(CART_DIFFICULTY_RAMP_MS * 10), 1);
  assert.equal(cartDifficultyFactor(-500), 0);
});

test("createCartEvent: always produces a valid lane, known kind, and a known enemy variant", () => {
  for (let i = 0; i < 200; i++) {
    const event = createCartEvent(100, Math.random());
    assert.ok(Number.isInteger(event.lane) && event.lane >= 0 && event.lane < CART_LANES);
    assert.ok(["coin", "cone", "barrier", "pothole", "enemy-car"].includes(event.kind));
    assert.equal(event.progress, 0);
    assert.ok(CART_ENEMY_VARIANTS.includes(event.variant));
    if (event.kind !== "enemy-car") {
      assert.equal(event.speed, 0, `${event.kind} should move with the road, not its own speed`);
    } else {
      // speed = BASE + range * (0.45 + difficulty*0.4 + rand*0.18); the 0.45..1.03 multiplier
      // range (difficulty=1, rand~1) can slightly exceed 1 by design (legacy fidelity) — bound
      // generously rather than assert a tight <= CART_MAX_SPEED that the source formula doesn't
      // actually guarantee.
      const range = CART_MAX_SPEED - CART_BASE_SPEED;
      assert.ok(event.speed >= CART_BASE_SPEED, `speed ${event.speed} below base`);
      assert.ok(event.speed <= CART_BASE_SPEED + range * 1.05, `speed ${event.speed} unexpectedly high`);
    }
  }
});

test("createCartEvent: id is unique across many spawns", () => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(createCartEvent(i, 0).id);
  assert.equal(ids.size, 100);
});

test("cartRoadSpeed: interpolates base..max as difficulty goes 0..1", () => {
  assert.equal(cartRoadSpeed(0), CART_BASE_SPEED);
  assert.equal(cartRoadSpeed(1), CART_MAX_SPEED);
  const mid = cartRoadSpeed(0.5);
  assert.ok(mid > CART_BASE_SPEED && mid < CART_MAX_SPEED);
});

test("cartRushScore: 1 point per 10 distance + CART_COIN_POINTS per coin", () => {
  assert.equal(cartRushScore(0, 0), 0);
  assert.equal(cartRushScore(100, 0), 10);
  assert.equal(cartRushScore(95, 0), 9); // floors
  assert.equal(cartRushScore(0, 3), 3 * CART_COIN_POINTS);
  assert.equal(cartRushScore(200, 2), 20 + 2 * CART_COIN_POINTS);
});

test("advanceCartRushEvents: advances progress by roadSpeed * tickSeconds for road-speed (speed=0) events", () => {
  const roadSpeed = 0.4;
  const events = [{ id: "a", lane: 0, kind: "coin", progress: 0, speed: 0, variant: CART_ENEMY_VARIANTS[0] }];
  const out = advanceCartRushEvents(events, roadSpeed);
  assert.equal(out.length, 1);
  const expected = 0 + roadSpeed * (CART_TICK_MS / 1000);
  assert.ok(Math.abs(out[0].progress - expected) < 1e-9);
});

test("advanceCartRushEvents: enemy-car events use their own speed, not roadSpeed", () => {
  const events = [{ id: "a", lane: 0, kind: "enemy-car", progress: 0, speed: 0.6, variant: CART_ENEMY_VARIANTS[0] }];
  const out = advanceCartRushEvents(events, 0.35);
  const expected = 0.6 * (CART_TICK_MS / 1000);
  assert.ok(Math.abs(out[0].progress - expected) < 1e-9);
});

test("advanceCartRushEvents: drops events once progress exceeds CART_DESPAWN_PROGRESS", () => {
  const events = [{ id: "a", lane: 0, kind: "cone", progress: CART_DESPAWN_PROGRESS + 0.001, speed: 0, variant: CART_ENEMY_VARIANTS[0] }];
  const out = advanceCartRushEvents(events, 0.5);
  assert.equal(out.length, 0);
});

test("resolveCartRushCollisions: coin in the player's lane past the collision threshold grants btcDelta and is consumed", () => {
  const events = [{ id: "a", lane: 1, kind: "coin", progress: CART_COLLISION_PROGRESS, speed: 0, variant: CART_ENEMY_VARIANTS[0] }];
  const result = resolveCartRushCollisions(events, 1);
  assert.equal(result.btcDelta, 1);
  assert.equal(result.healthDelta, 0);
  assert.equal(result.hit, null);
  assert.equal(result.survivors.length, 0);
});

test("resolveCartRushCollisions: obstacle in the player's lane past the threshold costs health and is reported as hit", () => {
  const events = [{ id: "a", lane: 2, kind: "barrier", progress: CART_COLLISION_PROGRESS, speed: 0, variant: CART_ENEMY_VARIANTS[0] }];
  const result = resolveCartRushCollisions(events, 2);
  assert.equal(result.healthDelta, -1);
  assert.equal(result.btcDelta, 0);
  assert.ok(result.hit);
  assert.equal(result.hit.id, "a");
  assert.equal(result.survivors.length, 0);
});

test("resolveCartRushCollisions: events in a different lane survive untouched even past the threshold", () => {
  const events = [{ id: "a", lane: 0, kind: "barrier", progress: CART_COLLISION_PROGRESS, speed: 0, variant: CART_ENEMY_VARIANTS[0] }];
  const result = resolveCartRushCollisions(events, 1);
  assert.equal(result.healthDelta, 0);
  assert.equal(result.btcDelta, 0);
  assert.equal(result.hit, null);
  assert.equal(result.survivors.length, 1);
  assert.equal(result.survivors[0].checked, true, "should be marked checked once it crosses the threshold");
});

test("resolveCartRushCollisions: an already-checked event in-lane is not resolved twice", () => {
  const events = [{ id: "a", lane: 1, kind: "coin", progress: CART_COLLISION_PROGRESS + 0.05, speed: 0, variant: CART_ENEMY_VARIANTS[0], checked: true }];
  const result = resolveCartRushCollisions(events, 1);
  assert.equal(result.btcDelta, 0);
  assert.equal(result.survivors.length, 1, "already-checked events keep traveling toward despawn");
});

test("resolveCartRushCollisions: events below the collision threshold are untouched regardless of lane", () => {
  const events = [{ id: "a", lane: 1, kind: "barrier", progress: CART_COLLISION_PROGRESS - 0.1, speed: 0, variant: CART_ENEMY_VARIANTS[0] }];
  const result = resolveCartRushCollisions(events, 1);
  assert.equal(result.healthDelta, 0);
  assert.equal(result.survivors.length, 1);
  assert.equal(result.survivors[0].checked, undefined);
});

test("advanceCartRushSpawn: ticks the cooldown down without spawning while cooldown remains", () => {
  const out = advanceCartRushSpawn([], 1000, 50, 0.2);
  assert.equal(out.events.length, 0);
  assert.equal(out.spawnCooldownMs, 1000 - CART_TICK_MS);
});

test("advanceCartRushSpawn: spawns a new event and resets the cooldown (clamped to CART_MIN_SPAWN_MS) once cooldown hits zero", () => {
  for (let i = 0; i < 30; i++) {
    const out = advanceCartRushSpawn([], CART_TICK_MS, 50, Math.random());
    assert.equal(out.events.length, 1);
    assert.ok(out.spawnCooldownMs >= CART_MIN_SPAWN_MS);
    assert.ok(out.spawnCooldownMs <= CART_BASE_SPAWN_MS + 140);
  }
});
