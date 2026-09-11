/**
 * Unit tests for game Turnstile every-N scheduling (pure math + env parse).
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

function everyNFromEnv(raw, fallback = 10) {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function isRequired(rewardedCount, everyN) {
  if (everyN <= 0) return false;
  return (rewardedCount + 1) % everyN === 0;
}

describe("game turnstile every-N", () => {
  const prev = process.env.GAME_TURNSTILE_EVERY_N;
  afterEach(() => {
    if (prev === undefined) delete process.env.GAME_TURNSTILE_EVERY_N;
    else process.env.GAME_TURNSTILE_EVERY_N = prev;
  });

  it("defaults to 10", () => {
    assert.equal(everyNFromEnv(""), 10);
    assert.equal(everyNFromEnv(undefined), 10);
  });

  it("0 disables", () => {
    assert.equal(everyNFromEnv("0"), 0);
    assert.equal(isRequired(9, 0), false);
  });

  it("requires on 10th, 20th, …", () => {
    assert.equal(isRequired(0, 10), false);
    assert.equal(isRequired(8, 10), false);
    assert.equal(isRequired(9, 10), true);
    assert.equal(isRequired(10, 10), false);
    assert.equal(isRequired(19, 10), true);
  });
});
