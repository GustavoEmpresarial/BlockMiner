import test from "node:test";
import assert from "node:assert/strict";
import {
  parseGameSlug,
  readMatch3GridCoord,
  readClampedNumber,
  skyMinElapsedMsForPipes,
} from "../../server/modules/games/games.pure.ts";

const NAMES = { "crypto-memory": "Memory Sync", "crypto-match-3": "Power Match" };

test("parseGameSlug: accepts known slugs", () => {
  assert.equal(parseGameSlug("crypto-memory", NAMES), "crypto-memory");
  assert.equal(parseGameSlug("  crypto-match-3  ", NAMES), "crypto-match-3");
});

test("parseGameSlug: rejects unknown slugs, non-strings, and oversize input", () => {
  assert.equal(parseGameSlug("sky-runner", NAMES), null);
  assert.equal(parseGameSlug(42, NAMES), null);
  assert.equal(parseGameSlug("", NAMES), null);
  assert.equal(parseGameSlug("a".repeat(65), NAMES), null);
});

test("readMatch3GridCoord: accepts valid in-bounds coordinates", () => {
  assert.deepEqual(readMatch3GridCoord({ x: 0, y: 0 }), { x: 0, y: 0 });
  assert.deepEqual(readMatch3GridCoord({ x: 7, y: 7 }), { x: 7, y: 7 });
});

test("readMatch3GridCoord: rejects out-of-bounds, non-integer, and malformed input", () => {
  assert.equal(readMatch3GridCoord({ x: 8, y: 0 }), null);
  assert.equal(readMatch3GridCoord({ x: -1, y: 0 }), null);
  assert.equal(readMatch3GridCoord({ x: 1.5, y: 0 }), null);
  assert.equal(readMatch3GridCoord(null), null);
  assert.equal(readMatch3GridCoord([1, 2]), null);
});

test("readClampedNumber: clamps and rejects out-of-range/non-finite values", () => {
  assert.equal(readClampedNumber(5, 0, 10), 5);
  assert.equal(readClampedNumber(11, 0, 10), null);
  assert.equal(readClampedNumber(-1, 0, 10), null);
  assert.equal(readClampedNumber(Infinity, 0, 10), null);
  assert.equal(readClampedNumber("abc", 0, 10), null);
});

// ─── sky-runner: skyMinElapsedMsForPipes (anti-cheat timing floor) ───────────

const SKY_GEOM = { worldW: 600, planeX: 140, spawnDx: 300, maxSpeed: 260 };

test("skyMinElapsedMsForPipes: zero (or negative) pipes require zero elapsed time", () => {
  assert.equal(skyMinElapsedMsForPipes(0, SKY_GEOM), 0);
  assert.equal(skyMinElapsedMsForPipes(-5, SKY_GEOM), 0);
});

test("skyMinElapsedMsForPipes: matches the documented first-pipe + per-pipe formula with 80% slack", () => {
  const firstPipeMs = ((SKY_GEOM.worldW + 200 - SKY_GEOM.planeX) / SKY_GEOM.maxSpeed) * 1000;
  const perPipeMs = (SKY_GEOM.spawnDx / SKY_GEOM.maxSpeed) * 1000;
  const expected1 = Math.floor(firstPipeMs * 0.8);
  assert.equal(skyMinElapsedMsForPipes(1, SKY_GEOM), expected1);
  const expected15 = Math.floor((firstPipeMs + 14 * perPipeMs) * 0.8);
  assert.equal(skyMinElapsedMsForPipes(15, SKY_GEOM), expected15);
});

test("skyMinElapsedMsForPipes: is strictly increasing in pipesPassed", () => {
  let prev = skyMinElapsedMsForPipes(1, SKY_GEOM);
  for (let p = 2; p <= 15; p += 1) {
    const cur = skyMinElapsedMsForPipes(p, SKY_GEOM);
    assert.ok(cur > prev, `expected minMs(${p}) > minMs(${p - 1})`);
    prev = cur;
  }
});

test("skyMinElapsedMsForPipes: a claimed finish faster than physics allows is rejectable (reported elapsed < floor)", () => {
  const minMs = skyMinElapsedMsForPipes(15, SKY_GEOM);
  const impossiblyFastClaim = 100; // ms — no client can pass 15 pipes in 100ms
  assert.ok(impossiblyFastClaim < minMs);
});
