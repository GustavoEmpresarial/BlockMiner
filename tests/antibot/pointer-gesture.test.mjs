/**
 * Unit tests for pointer-gesture authorization (blocks HTMLElement.click bots).
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  POINTER_GESTURE_MAX_AGE_MS,
  KEY_ACTIVATE_MAX_AGE_MS,
  hasRecentPointerGesture,
  hasRecentKeyActivate,
  nodesRelated,
  isActivateKey,
} from "../../client/src/shared/utils/pointerGesture.ts";

describe("pointerGesture constants", () => {
  it("exposes named age windows", () => {
    assert.equal(POINTER_GESTURE_MAX_AGE_MS, 2500);
    assert.equal(KEY_ACTIVATE_MAX_AGE_MS, 2500);
  });
});

describe("isActivateKey", () => {
  it("accepts Enter and Space", () => {
    assert.equal(isActivateKey("Enter"), true);
    assert.equal(isActivateKey(" "), true);
    assert.equal(isActivateKey("Spacebar"), true);
    assert.equal(isActivateKey("a"), false);
  });
});

describe("nodesRelated", () => {
  it("matches identical targets", () => {
    const a = { id: 1 };
    assert.equal(nodesRelated(a, a), true);
  });

  it("rejects nulls", () => {
    assert.equal(nodesRelated(null, null), false);
    assert.equal(nodesRelated({}, null), false);
  });
});

describe("hasRecentPointerGesture", () => {
  const target = { id: "btn" };
  const now = 100_000;

  it("rejects missing gesture (HTMLElement.click path)", () => {
    assert.equal(hasRecentPointerGesture(target, now, null), false);
  });

  it("accepts fresh gesture on same target", () => {
    const g = { at: now - 100, x: 12, y: 34, target };
    assert.equal(hasRecentPointerGesture(target, now, g), true);
  });

  it("rejects stale gesture", () => {
    const g = { at: now - POINTER_GESTURE_MAX_AGE_MS - 1, x: 12, y: 34, target };
    assert.equal(hasRecentPointerGesture(target, now, g), false);
  });

  it("rejects NaN coordinates", () => {
    const g = { at: now - 100, x: Number.NaN, y: 34, target };
    assert.equal(hasRecentPointerGesture(target, now, g), false);
  });

  it("rejects different target", () => {
    const g = { at: now - 100, x: 12, y: 34, target: { id: "other" } };
    assert.equal(hasRecentPointerGesture(target, now, g), false);
  });
});

describe("hasRecentKeyActivate", () => {
  const target = { id: "btn" };
  const now = 100_000;

  it("accepts fresh key activate on same target", () => {
    assert.equal(hasRecentKeyActivate(target, now, { at: now - 50, target }), true);
  });

  it("rejects stale key activate", () => {
    assert.equal(
      hasRecentKeyActivate(target, now, { at: now - KEY_ACTIVATE_MAX_AGE_MS - 1, target }),
      false,
    );
  });
});
