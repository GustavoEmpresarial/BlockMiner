export function skySeedFromHex(hex: string): number {
  let s = 0;
  const clean = (hex || "").replace(/[^0-9a-f]/gi, "");
  for (let i = 0; i < clean.length; i += 8) {
    const chunk = clean.slice(i, i + 8);
    if (chunk.length === 0) break;
    s = (s ^ parseInt(chunk, 16)) >>> 0;
  }
  return s || 0x9e3779b9;
}

/** mulberry32 — tiny deterministic PRNG returning floats in [0,1). */
export function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SkyPipe = {
  id: number;
  x: number;
  gapTop: number;
  gapBottom: number;
  passed: boolean;
};

export type SkyConfig = {
  seed: string;
  worldW: number;
  worldH: number;
  planeX: number;
  planeRadius: number;
  pipeW: number;
  pipeGap: number;
  pipeGapMin: number;
  pipeSpawnDx: number;
  pipeMargin: number;
  scrollSpeedBase: number;
  scrollSpeedMax: number;
  difficultyRampMs: number;
  gravity: number;
  flapVy: number;
  maxVy: number;
  minFlapIntervalMs: number;
  invulnMs: number;
  targetPipes: number;
  lives: number;
  maxLives: number;
  checkpointEveryPipes: number;
};

export type SkyPhysicsState = {
  y: number;
  vy: number;
  pipes: SkyPipe[];
  pipeSeq: number;
  nextSpawnX: number;
  scrollSpeed: number;
  elapsedMs: number;
  lives: number;
  invulnUntil: number;
  pipesPassed: number;
  score: number;
  lastFlapAt: number;
  rng: () => number;
  crashed: string | null;
  finished: boolean;
};

export type SkyParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
};

export function createPhysicsState(config: SkyConfig): SkyPhysicsState {
  return {
    y: config.worldH / 2,
    vy: 0,
    pipes: [],
    pipeSeq: 0,
    nextSpawnX: config.worldW + 200,
    scrollSpeed: config.scrollSpeedBase,
    elapsedMs: 0,
    lives: config.lives,
    invulnUntil: 0,
    pipesPassed: 0,
    score: 0,
    lastFlapAt: 0,
    rng: makeMulberry32(skySeedFromHex(config.seed)),
    crashed: null,
    finished: false,
  };
}

export type SkyStepEvent =
  | { type: "checkpoint"; pipesPassed: number; elapsedMs: number; lives: number; score: number }
  | { type: "finish"; pipesPassed: number; elapsedMs: number; score: number; won: boolean }
  | { type: "life_lost"; reason: string; lives: number }
  | { type: "pipe_scored"; pipesPassed: number; score: number }
  | { type: "invuln_changed"; invulnerable: boolean };

export function tryFlap(state: SkyPhysicsState, config: SkyConfig, now: number): boolean {
  if (state.finished || state.crashed) return false;
  if (now - state.lastFlapAt < config.minFlapIntervalMs) return false;
  state.lastFlapAt = now;
  state.vy = config.flapVy;
  return true;
}

function spawnPipe(state: SkyPhysicsState, config: SkyConfig): void {
  const ramp = Math.min(1, state.elapsedMs / config.difficultyRampMs);
  const gap = config.pipeGap - (config.pipeGap - config.pipeGapMin) * ramp;
  const minCenter = config.pipeMargin + gap / 2;
  const maxCenter = config.worldH - config.pipeMargin - gap / 2;
  const center = minCenter + state.rng() * Math.max(0, maxCenter - minCenter);
  state.pipes.push({
    id: ++state.pipeSeq,
    x: state.nextSpawnX,
    gapTop: center - gap / 2,
    gapBottom: center + gap / 2,
    passed: false,
  });
  state.nextSpawnX += config.pipeSpawnDx;
}

/** Advance simulation by `dtMs`. Mutates `state` and returns emitted events. */
export function stepPhysics(
  state: SkyPhysicsState,
  config: SkyConfig,
  dtMs: number,
  now: number,
  lastCheckpointEpoch: number,
): { events: SkyStepEvent[]; checkpointEpoch: number } {
  const events: SkyStepEvent[] = [];
  if (state.finished || state.crashed) {
    return { events, checkpointEpoch: lastCheckpointEpoch };
  }

  state.elapsedMs += dtMs;
  const invulnerable = now < state.invulnUntil;

  const tRamp = Math.min(1, state.elapsedMs / config.difficultyRampMs);
  state.scrollSpeed =
    config.scrollSpeedBase + (config.scrollSpeedMax - config.scrollSpeedBase) * tRamp;

  const dtSec = dtMs / 1000;
  state.vy = Math.min(config.maxVy, state.vy + config.gravity * dtSec);
  state.y += state.vy * dtSec;

  const dx = state.scrollSpeed * dtSec;
  for (const p of state.pipes) p.x -= dx;
  state.nextSpawnX -= dx;
  state.pipes = state.pipes.filter((p) => p.x + config.pipeW > -40);

  let safety = 12;
  while (
    (state.nextSpawnX < config.worldW + config.pipeSpawnDx * 2 || state.pipes.length < 4) &&
    safety-- > 0
  ) {
    spawnPipe(state, config);
  }

  let died = false;
  const loseLife = (reason: string) => {
    if (invulnerable) return;
    state.lives = Math.max(0, state.lives - 1);
    events.push({ type: "life_lost", reason, lives: state.lives });
    if (state.lives <= 0) {
      state.crashed = reason;
      died = true;
    } else {
      state.y = config.worldH / 2;
      state.vy = 0;
      state.invulnUntil = now + config.invulnMs;
      events.push({ type: "invuln_changed", invulnerable: true });
    }
  };

  if (state.y - config.planeRadius <= 0) {
    state.y = config.planeRadius + 1;
    loseLife("ceiling");
  } else if (state.y + config.planeRadius >= config.worldH) {
    state.y = config.worldH - config.planeRadius - 1;
    loseLife("floor");
  }

  if (!died) {
    const pl = config.planeX - config.planeRadius;
    const pr = config.planeX + config.planeRadius;
    const pt = state.y - config.planeRadius;
    const pb = state.y + config.planeRadius;
    for (const p of state.pipes) {
      const pLeft = p.x;
      const pRight = p.x + config.pipeW;
      const overlapsX = pr > pLeft && pl < pRight;
      if (overlapsX && !invulnerable) {
        if (pt < p.gapTop || pb > p.gapBottom) {
          p.passed = true;
          loseLife("pipe");
          break;
        }
      }
      if (!p.passed && pRight < pl) {
        p.passed = true;
        state.pipesPassed += 1;
        state.score += 100;
        events.push({ type: "pipe_scored", pipesPassed: state.pipesPassed, score: state.score });
      }
    }
  }

  const stillInvulnerable = now < state.invulnUntil;
  if (!invulnerable && stillInvulnerable) {
    events.push({ type: "invuln_changed", invulnerable: true });
  } else if (invulnerable && !stillInvulnerable) {
    events.push({ type: "invuln_changed", invulnerable: false });
  }

  let checkpointEpoch = lastCheckpointEpoch;
  const cpStep = Math.max(1, config.checkpointEveryPipes);
  const cpEpoch = Math.floor(state.pipesPassed / cpStep);
  if (cpEpoch > lastCheckpointEpoch && state.pipesPassed > 0) {
    checkpointEpoch = cpEpoch;
    events.push({
      type: "checkpoint",
      pipesPassed: state.pipesPassed,
      elapsedMs: Math.floor(state.elapsedMs),
      lives: state.lives,
      score: state.score,
    });
  }

  if (!state.finished) {
    if (state.pipesPassed >= config.targetPipes) {
      state.finished = true;
      events.push({
        type: "finish",
        pipesPassed: state.pipesPassed,
        elapsedMs: Math.floor(state.elapsedMs),
        score: state.score,
        won: true,
      });
    } else if (state.crashed) {
      state.finished = true;
      events.push({
        type: "finish",
        pipesPassed: state.pipesPassed,
        elapsedMs: Math.floor(state.elapsedMs),
        score: state.score,
        won: false,
      });
    }
  }

  return { events, checkpointEpoch };
}

/** Current pipe gap size at a given elapsed time (for tests / debug). */
export function currentPipeGap(config: SkyConfig, elapsedMs: number): number {
  const ramp = Math.min(1, elapsedMs / config.difficultyRampMs);
  return config.pipeGap - (config.pipeGap - config.pipeGapMin) * ramp;
}
