import { describe, expect, it } from "vitest";
import {
  createPhysicsState,
  currentPipeGap,
  makeMulberry32,
  skySeedFromHex,
  stepPhysics,
  tryFlap,
  type SkyConfig,
} from "./skyRunner.util";

const TEST_CONFIG: SkyConfig = {
  seed: "abc123def456",
  worldW: 600,
  worldH: 800,
  planeX: 140,
  planeRadius: 38,
  pipeW: 90,
  pipeGap: 250,
  pipeGapMin: 190,
  pipeSpawnDx: 300,
  pipeMargin: 90,
  scrollSpeedBase: 170,
  scrollSpeedMax: 260,
  difficultyRampMs: 60_000,
  gravity: 1500,
  flapVy: -480,
  maxVy: 800,
  minFlapIntervalMs: 80,
  invulnMs: 1500,
  targetPipes: 15,
  lives: 3,
  maxLives: 3,
  checkpointEveryPipes: 5,
};

describe("skySeedFromHex", () => {
  it("is deterministic for the same hex input", () => {
    expect(skySeedFromHex("deadbeef")).toBe(skySeedFromHex("deadbeef"));
  });

  it("falls back to a non-zero default for empty input", () => {
    expect(skySeedFromHex("")).toBe(0x9e3779b9);
  });
});

describe("makeMulberry32", () => {
  it("returns values in [0, 1)", () => {
    const rng = makeMulberry32(42);
    for (let i = 0; i < 20; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("currentPipeGap", () => {
  it("starts at pipeGap and shrinks toward pipeGapMin over the ramp", () => {
    expect(currentPipeGap(TEST_CONFIG, 0)).toBe(250);
    expect(currentPipeGap(TEST_CONFIG, 30_000)).toBeCloseTo(220, 0);
    expect(currentPipeGap(TEST_CONFIG, 60_000)).toBe(190);
  });
});

describe("tryFlap", () => {
  it("applies flapVy when interval allows", () => {
    const state = createPhysicsState(TEST_CONFIG);
    const now = 1000;
    expect(tryFlap(state, TEST_CONFIG, now)).toBe(true);
    expect(state.vy).toBe(-480);
    expect(tryFlap(state, TEST_CONFIG, now + 10)).toBe(false);
    expect(tryFlap(state, TEST_CONFIG, now + 80)).toBe(true);
  });
});

describe("stepPhysics", () => {
  it("spawns pipes inside margin bounds", () => {
    const state = createPhysicsState(TEST_CONFIG);
    stepPhysics(state, TEST_CONFIG, 16, 1000, 0);
    expect(state.pipes.length).toBeGreaterThanOrEqual(4);
    for (const pipe of state.pipes) {
      expect(pipe.gapTop).toBeGreaterThanOrEqual(TEST_CONFIG.pipeMargin);
      expect(pipe.gapBottom).toBeLessThanOrEqual(TEST_CONFIG.worldH - TEST_CONFIG.pipeMargin);
      expect(pipe.gapBottom - pipe.gapTop).toBeGreaterThanOrEqual(TEST_CONFIG.pipeGapMin - 1);
    }
  });

  it("pulls the drone down with gravity", () => {
    const state = createPhysicsState(TEST_CONFIG);
    const startY = state.y;
    stepPhysics(state, TEST_CONFIG, 100, 1000, 0);
    expect(state.y).toBeGreaterThan(startY);
    expect(state.vy).toBeGreaterThan(0);
  });

  it("emits checkpoint every 5 pipes", () => {
    const state = createPhysicsState(TEST_CONFIG);
    state.pipesPassed = 4;
    let epoch = 0;
    const { events, checkpointEpoch } = stepPhysics(state, TEST_CONFIG, 16, 2000, epoch);
    state.pipesPassed = 5;
    const next = stepPhysics(state, TEST_CONFIG, 16, 2016, checkpointEpoch);
    const checkpoints = next.events.filter((e) => e.type === "checkpoint");
    expect(checkpoints.length).toBe(1);
    if (checkpoints[0]?.type === "checkpoint") {
      expect(checkpoints[0].pipesPassed).toBe(5);
    }
    expect(next.checkpointEpoch).toBe(1);
    void events;
    void epoch;
  });

  it("finishes with a win at targetPipes", () => {
    const state = createPhysicsState(TEST_CONFIG);
    state.pipesPassed = TEST_CONFIG.targetPipes;
    const { events } = stepPhysics(state, TEST_CONFIG, 16, 3000, 2);
    const finish = events.find((e) => e.type === "finish");
    expect(finish).toBeDefined();
    if (finish?.type === "finish") {
      expect(finish.won).toBe(true);
      expect(finish.score).toBe(state.score);
    }
    expect(state.finished).toBe(true);
  });

  it("loses a life on floor collision", () => {
    const state = createPhysicsState(TEST_CONFIG);
    state.y = TEST_CONFIG.worldH;
    state.vy = 400;
    const { events } = stepPhysics(state, TEST_CONFIG, 50, 4000, 0);
    expect(state.lives).toBe(2);
    expect(events.some((e) => e.type === "life_lost")).toBe(true);
  });

  it("is deterministic for the same seed across runs", () => {
    const a = createPhysicsState(TEST_CONFIG);
    const b = createPhysicsState(TEST_CONFIG);
    for (let i = 0; i < 30; i += 1) {
      stepPhysics(a, TEST_CONFIG, 16, 5000 + i * 16, 0);
      stepPhysics(b, TEST_CONFIG, 16, 5000 + i * 16, 0);
    }
    expect(a.pipes.map((p) => [p.gapTop, p.gapBottom])).toEqual(
      b.pipes.map((p) => [p.gapTop, p.gapBottom]),
    );
  });
});
