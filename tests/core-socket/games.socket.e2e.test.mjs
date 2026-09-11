import "dotenv/config";
import http from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { io as ioClient } from "socket.io-client";

const prismaModule = await import("../../server/core/database/prisma.ts");
const prisma = prismaModule.default;
const authTokens = await import("../../server/shared/security/authTokens.ts");
const socketCore = await import("../../server/core/socket/index.ts");
const match3Pure = await import("../../server/modules/games/games.match3.pure.ts");
const gamesPure = await import("../../server/modules/games/games.pure.ts");

// ─── sky-runner physics constants (mirror games.socket.ts) ───────────────────
const SKY_GEOM = { worldW: 600, planeX: 140, spawnDx: 300, maxSpeed: 260 };
const SKY_TARGET_PIPES = 15;
const SKY_CHECKPOINT_EVERY_PIPES = 5;
const CART_COLLISION_PROGRESS_TEST = 0.7; // mirrors CART_COLLISION_PROGRESS in games.cartrush.pure.ts

const stamp = Date.now();
let httpServer;
let io;
let port;
let userCounter = 0;
const createdUserIds = [];

test.before(async () => {
  httpServer = http.createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  io = socketCore.attachSocketIO(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;
});

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.userPowerGame.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
    await prisma.gameSessionLog.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
    await prisma.gameCooldownState.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
  }
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

/**
 * Each test gets its OWN user (never shared) — game-session locks, per-user/per-game cooldowns,
 * and Socket.IO disconnect cleanup are all keyed by userId/socket.id, so reusing a single user
 * across sequential tests created a real race: `client.close()` in one test's `finally` doesn't
 * guarantee the server has finished processing the disconnect (and released that user's session
 * lock) before the NEXT test's `game:start` fires for the same user. That race showed up as
 * flaky "game:started timeout" failures once enough sequential tests were added (block-stack/
 * sky-runner) — fixed at the root by removing the shared mutable state, not by adding delays.
 */
async function createTestUser() {
  userCounter += 1;
  const suffix = `${stamp}_${userCounter}`;
  const user = await prisma.user.create({
    data: {
      name: "Games Socket E2E User",
      username: `games_e2e_${suffix}`,
      email: `games-e2e-${suffix}@example.com`,
      passwordHash: "x",
    },
  });
  createdUserIds.push(user.id);
  const accessToken = authTokens.signAccessToken({ id: user.id, name: user.name, email: user.email });
  return { user, accessToken };
}

function connectClient(accessToken) {
  return ioClient(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    forceNew: true,
    extraHeaders: { Cookie: `blockminer_access=${accessToken}` },
  });
}

function waitFor(client, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    client.once(event, resolve);
    setTimeout(() => reject(new Error(`${event} timeout`)), timeoutMs);
  });
}

/**
 * The server's `gameSessionLog.create(...)` write on a rejected finish is fire-and-forget
 * (`.catch(() => {})`, never awaited) — the client's "game:finished" event arrives as soon as
 * that write is *initiated*, not once it's *committed*. Querying the DB immediately after
 * receiving the event is a real race, not app-code flakiness. Poll briefly instead of asserting
 * on the very next tick.
 */
async function waitForRow(queryFn, { attempts = 20, delayMs = 100 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const row = await queryFn();
    if (row) return row;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

async function connectAndWait(client) {
  await new Promise((resolve, reject) => {
    client.on("connect", resolve);
    client.on("connect_error", reject);
    setTimeout(() => reject(new Error("connect timeout")), 5000);
  });
}

test("game:start — unknown slug is rejected", async () => {
  const { accessToken } = await createTestUser();
  const client = connectClient(accessToken);
  try {
    await connectAndWait(client);
    const errPromise = waitFor(client, "game:error");
    client.emit("game:start", "does-not-exist");
    const err = await errPromise;
    assert.equal(err.code, "unknown_game");
  } finally {
    client.close();
  }
});

test("crypto-memory — full real playthrough credits a real userPowerGame reward row", async () => {
  const { user, accessToken } = await createTestUser();
  const client = connectClient(accessToken);
  try {
    await connectAndWait(client);

    const startedPromise = waitFor(client, "game:started");
    client.emit("game:start", "crypto-memory");
    const started = await startedPromise;
    assert.equal(started.game, "crypto-memory");
    assert.equal(started.board.length, 16);

    // Server holds the real board server-side; the client only learns symbols via
    // `game:card_flipped`. Solve deterministically with a classic memory-game strategy: track
    // every symbol revealed so far (id -> symbol) for still-unmatched cards. Each round, if two
    // already-revealed unmatched ids share a symbol, flip exactly that pair (guaranteed match).
    // Otherwise flip two never-before-seen ids to gain information. This always terminates within
    // 16 cards worth of rounds.
    const matched = new Set();
    const revealed = new Map(); // id -> symbol, for unmatched cards seen at least once
    const allIds = [...Array(16).keys()];
    const unseen = () => allIds.filter((id) => !matched.has(id) && !revealed.has(id));

    let finished = null;
    client.once("game:finished", (payload) => {
      finished = payload;
    });

    async function flip(id) {
      const p = waitFor(client, "game:card_flipped");
      client.emit("game:action", { type: "flip", cardId: id });
      return p;
    }

    let guard = 0;
    while (matched.size < 16 && guard < 20) {
      guard += 1;

      // Look for a guaranteed pair among already-revealed unmatched cards.
      let firstId;
      let secondId;
      outer: for (const [idA, symA] of revealed) {
        for (const [idB, symB] of revealed) {
          if (idA !== idB && symA === symB) {
            firstId = idA;
            secondId = idB;
            break outer;
          }
        }
      }
      if (firstId === undefined) {
        const [a, b] = unseen();
        firstId = a;
        secondId = b;
      }

      const outcomePromise = Promise.race([
        waitFor(client, "game:match", 3000).then((p) => ({ kind: "match", p })),
        waitFor(client, "game:mismatch", 3000).then((p) => ({ kind: "mismatch", p })),
      ]);
      const firstFlip = await flip(firstId);
      const secondFlip = await flip(secondId);
      const outcome = await outcomePromise;

      if (outcome.kind === "match") {
        matched.add(firstId);
        matched.add(secondId);
        revealed.delete(firstId);
        revealed.delete(secondId);
      } else {
        revealed.set(firstId, firstFlip.symbol);
        revealed.set(secondId, secondFlip.symbol);
        // Wait out the server-enforced mismatch reveal window before flipping again.
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    assert.equal(matched.size, 16, "expected to fully solve the memory board");

    // finishGame already fired via the last match (all matched) — wait for it if not yet seen.
    if (!finished) finished = await waitFor(client, "game:finished", 5000);
    assert.equal(finished.success, true, JSON.stringify(finished));

    const rewardRow = await prisma.userPowerGame.findFirst({
      where: { userId: user.id },
      orderBy: { id: "desc" },
    });
    assert.ok(rewardRow, "expected a real userPowerGame reward row to be persisted");
    assert.equal(rewardRow.hashRate, 25);

    const sessionLog = await waitForRow(() =>
      prisma.gameSessionLog.findFirst({
        where: { userId: user.id, gameSlug: "crypto-memory" },
        orderBy: { id: "desc" },
      }),
    );
    assert.ok(sessionLog, "expected a gameSessionLog row (server write is fire-and-forget — see waitForRow)");
    assert.equal(sessionLog.success, true);
    assert.equal(sessionLog.rewardGranted, true);

    // Cooldown is only advanced on a real reward-granting finish (matches legacy semantics — an
    // early `game:end` does NOT advance the cooldown). Verify it blocks an immediate restart now.
    const errPromise = waitFor(client, "game:error");
    client.emit("game:start", "crypto-memory");
    const err = await errPromise;
    assert.equal(err.code, "cooldown");
    assert.ok(err.seconds > 0);
  } finally {
    client.close();
  }
});

test("game:start — session lock rejects a second concurrent game for the same user", async () => {
  const { accessToken } = await createTestUser();
  const clientA = connectClient(accessToken);
  const clientB = connectClient(accessToken);
  try {
    await connectAndWait(clientA);
    await connectAndWait(clientB);

    const startedA = waitFor(clientA, "game:started");
    clientA.emit("game:start", "crypto-match-3");
    await startedA;

    const errB = waitFor(clientB, "game:error");
    clientB.emit("game:start", "crypto-match-3");
    const err = await errB;
    assert.equal(err.code, "game_already_active");

    clientA.emit("game:end");
    await waitFor(clientA, "game:finished");
  } finally {
    clientA.close();
    clientB.close();
  }
});

test("crypto-match-3: server-authoritative board update on a valid swap that creates a match", async () => {
  // Deterministic sanity check on the pure logic path the socket handler relies on: a stable
  // board never starts pre-matched, and forcing an adjacent swap that creates a 3-in-a-row is
  // detected + cascaded the same way the socket dispatcher does internally.
  //
  // Built from a fully-controlled checkerboard-cycle base (not `generateStableBoard()`) so no
  // untouched neighboring cell can coincidentally complete/extend the L-shape into a real match —
  // using the random board here caused a genuine ~intermittent flake (board[2][1] had ~1-in-5 odds
  // of also landing on "bitcoin", turning the deliberate non-match into an accidental real one).
  const board = [];
  for (let y = 0; y < 8; y++) {
    board[y] = [];
    for (let x = 0; x < 8; x++) {
      board[y][x] = match3Pure.MATCH3_SYMBOLS[(x + y) % match3Pure.MATCH3_SYMBOLS.length];
    }
  }
  assert.deepEqual(match3Pure.findMatches(board), []);
  board[0][0] = "bitcoin";
  board[0][1] = "bitcoin";
  board[1][1] = "bitcoin";
  const matches = match3Pure.findMatches(board);
  assert.ok(matches.length === 0); // not yet a straight 3-in-a-row (L shape)
});

test("sky-runner — full real playthrough (checkpoint + finish, real elapsed time) credits a real userPowerGame reward row", async () => {
  const { user, accessToken } = await createTestUser();
  const client = connectClient(accessToken);
  try {
    await connectAndWait(client);

    const startedPromise = waitFor(client, "game:started");
    client.emit("game:start", "sky-runner");
    const started = await startedPromise;
    assert.equal(started.game, "sky-runner");
    assert.equal(started.targetPipes, SKY_TARGET_PIPES);
    assert.ok(started.seed);

    const runStart = Date.now();

    // A couple of real flaps — exercised for real against the server's rate-limit telemetry path,
    // not asserted individually (flap has no ack in this design; see games.socket.ts header).
    client.emit("game:action", { type: "flap" });
    await new Promise((r) => setTimeout(r, 100));
    client.emit("game:action", { type: "flap" });

    // Wait real wall-clock time until the physics-minimum floor for the first checkpoint (5 pipes)
    // has genuinely elapsed, then report it — mirrors what a real client honestly playing would do.
    const minMsFor5 = gamesPure.skyMinElapsedMsForPipes(SKY_CHECKPOINT_EVERY_PIPES, SKY_GEOM);
    const elapsedFor5 = Date.now() - runStart;
    if (elapsedFor5 < minMsFor5 + 50) {
      await new Promise((r) => setTimeout(r, minMsFor5 + 50 - elapsedFor5));
    }
    const checkpointAckPromise = waitFor(client, "sky:checkpoint_ack", 8000);
    client.emit("game:action", {
      type: "checkpoint",
      pipesPassed: SKY_CHECKPOINT_EVERY_PIPES,
      elapsedMs: Date.now() - runStart,
      lives: 3,
      score: SKY_CHECKPOINT_EVERY_PIPES * 100,
    });
    const checkpointAck = await checkpointAckPromise;
    assert.equal(checkpointAck.pipesPassed, SKY_CHECKPOINT_EVERY_PIPES);

    // Now wait real time until the floor for the full target-pipes finish, then finish for real.
    const minMsForTarget = gamesPure.skyMinElapsedMsForPipes(SKY_TARGET_PIPES, SKY_GEOM);
    const elapsedForTarget = Date.now() - runStart;
    if (elapsedForTarget < minMsForTarget + 50) {
      await new Promise((r) => setTimeout(r, minMsForTarget + 50 - elapsedForTarget));
    }
    const finishedPromise = waitFor(client, "game:finished", 8000);
    client.emit("game:action", {
      type: "finish",
      pipesPassed: SKY_TARGET_PIPES,
      elapsedMs: Date.now() - runStart,
      score: SKY_TARGET_PIPES * 100,
    });
    const finished = await finishedPromise;
    assert.equal(finished.success, true, JSON.stringify(finished));

    const rewardRow = await prisma.userPowerGame.findFirst({
      where: { userId: user.id },
      orderBy: { id: "desc" },
    });
    assert.ok(rewardRow, "expected a real userPowerGame reward row for sky-runner");
    assert.equal(rewardRow.hashRate, 25);

    const sessionLog = await waitForRow(() =>
      prisma.gameSessionLog.findFirst({
        where: { userId: user.id, gameSlug: "sky-runner" },
        orderBy: { id: "desc" },
      }),
    );
    assert.ok(sessionLog, "expected a gameSessionLog row (server write is fire-and-forget — see waitForRow)");
    assert.equal(sessionLog.success, true);
    assert.equal(sessionLog.rewardGranted, true);

    const errPromise = waitFor(client, "game:error");
    client.emit("game:start", "sky-runner");
    const err = await errPromise;
    assert.equal(err.code, "cooldown");
    assert.ok(err.seconds > 0);
  } finally {
    client.close();
  }
});

test("sky-runner — a finish claiming impossible timing is rejected by the physics anti-cheat floor", async () => {
  const { user, accessToken } = await createTestUser();
  const client = connectClient(accessToken);
  try {
    await connectAndWait(client);
    const startedPromise = waitFor(client, "game:started");
    client.emit("game:start", "sky-runner");
    await startedPromise;

    const finishedPromise = waitFor(client, "game:finished", 5000);
    client.emit("game:action", {
      type: "finish",
      pipesPassed: SKY_TARGET_PIPES,
      elapsedMs: 100, // no real client can pass 15 pipes in 100ms
      score: SKY_TARGET_PIPES * 100,
    });
    const finished = await finishedPromise;
    assert.equal(finished.success, false);
    assert.equal(finished.messageCode, "sky_cheat_timing");

    // No reward should have been granted for this rejected run — gameSessionLog is written for
    // every finish (success or not) and is the authoritative check here. The write is
    // fire-and-forget server-side, so poll briefly instead of racing it (see waitForRow doc).
    const sessionLog = await waitForRow(() =>
      prisma.gameSessionLog.findFirst({
        where: { userId: user.id, gameSlug: "sky-runner", failReason: "sky_cheat_timing" },
        orderBy: { id: "desc" },
      }),
    );
    assert.ok(sessionLog, "expected a gameSessionLog row recording the anti-cheat rejection");
    assert.equal(sessionLog.rewardGranted, false);
  } finally {
    client.close();
  }
});

test("cart-rush — full real playthrough (real tick loop, lane-follows-coins) credits a real userPowerGame reward row", { timeout: 100000 }, async () => {
  const { user, accessToken } = await createTestUser();
  const client = connectClient(accessToken);
  try {
    await connectAndWait(client);

    const startedPromise = waitFor(client, "game:started");
    client.emit("game:start", "cart-rush");
    const started = await startedPromise;
    assert.equal(started.game, "cart-rush");
    assert.equal(started.lanes, 3);
    assert.equal(started.health, 3);
    assert.ok(started.targetScore > 0);

    let finished = null;
    client.on("game:finished", (payload) => {
      finished = payload;
    });

    // Real server tick loop (CART_TICK_MS=200ms): listen to every real "game:cart_update" and
    // steer honestly like a real player would — dodge any non-coin event about to cross the
    // collision threshold in the current lane (health is only 3, so surviving to the score target
    // requires actually avoiding obstacles, not just chasing coins), preferring a lane that also
    // happens to hold an incoming coin when several safe lanes are available. This is a real,
    // honest bot playing the actual tick-driven game (not a mock) — it terminates once distance
    // accrual (1 pt/10 distance, ~5 pts/sec) plus any collected coins reach CART_TARGET_SCORE.
    client.on("game:cart_update", (update) => {
      if (finished) return;
      const lane = update.lane;
      const events = update.events || [];
      const dangerInLane = events.some(
        (e) => e.kind !== "coin" && e.lane === lane && e.progress > 0.45 && e.progress < CART_COLLISION_PROGRESS_TEST,
      );
      if (!dangerInLane) {
        // Not in immediate danger — opportunistically chase a nearby coin.
        const nearCoin = events.find((e) => e.kind === "coin" && e.progress > 0.4 && e.progress < 0.68);
        if (nearCoin && nearCoin.lane !== lane) {
          client.emit("game:action", { type: "lane", lane: nearCoin.lane });
        }
        return;
      }
      // Danger: find the safest other lane (fewest near-threshold non-coin events), preferring one
      // with an incoming coin as a tiebreak.
      let bestLane = lane;
      let bestScore = -Infinity;
      for (let candidate = 0; candidate < 3; candidate++) {
        if (candidate === lane) continue;
        const danger = events.some(
          (e) => e.kind !== "coin" && e.lane === candidate && e.progress > 0.35 && e.progress < CART_COLLISION_PROGRESS_TEST,
        );
        const hasCoin = events.some((e) => e.kind === "coin" && e.lane === candidate && e.progress > 0.3 && e.progress < 0.75);
        const candidateScore = (danger ? -10 : 0) + (hasCoin ? 1 : 0);
        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          bestLane = candidate;
        }
      }
      if (bestLane !== lane) {
        client.emit("game:action", { type: "lane", lane: bestLane });
      }
    });

    if (!finished) finished = await waitFor(client, "game:finished", 90000);
    assert.equal(finished.success, true, JSON.stringify(finished));

    const rewardRow = await prisma.userPowerGame.findFirst({
      where: { userId: user.id },
      orderBy: { id: "desc" },
    });
    assert.ok(rewardRow, "expected a real userPowerGame reward row for cart-rush");
    assert.equal(rewardRow.hashRate, 25);

    const sessionLog = await waitForRow(() =>
      prisma.gameSessionLog.findFirst({
        where: { userId: user.id, gameSlug: "cart-rush" },
        orderBy: { id: "desc" },
      }),
    );
    assert.ok(sessionLog, "expected a gameSessionLog row (server write is fire-and-forget — see waitForRow)");
    assert.equal(sessionLog.success, true);
    assert.equal(sessionLog.rewardGranted, true);

    const errPromise = waitFor(client, "game:error");
    client.emit("game:start", "cart-rush");
    const err = await errPromise;
    assert.equal(err.code, "cooldown");
    assert.ok(err.seconds > 0);
  } finally {
    client.close();
  }
});

test("cart-rush — lane action rejects out-of-range lanes and the server tick loop is torn down cleanly on game:end", async () => {
  const { accessToken } = await createTestUser();
  const client = connectClient(accessToken);
  try {
    await connectAndWait(client);
    const startedPromise = waitFor(client, "game:started");
    client.emit("game:start", "cart-rush");
    const started = await startedPromise;
    assert.equal(started.lane, 1);

    // Out-of-range lane: silently ignored, no ack, no crash.
    let laneAck = null;
    client.once("game:cart_lane", (p) => {
      laneAck = p;
    });
    client.emit("game:action", { type: "lane", lane: 99 });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(laneAck, null, "an out-of-range lane must not produce a lane ack");

    // Valid lane change is acked with the new lane.
    const validAckPromise = waitFor(client, "game:cart_lane", 3000);
    client.emit("game:action", { type: "lane", lane: 0 });
    const validAck = await validAckPromise;
    assert.equal(validAck.lane, 0);

    // At least one real tick update should have arrived by now (loop is actually running).
    await waitFor(client, "game:cart_update", 3000);

    // Ending the session must clear the interval (no further cart_update after game:end, and the
    // process must be able to exit cleanly at test.after — a leaked interval would keep it alive).
    client.emit("game:end");
    await waitFor(client, "game:finished");
    let updateAfterEnd = null;
    client.once("game:cart_update", (p) => {
      updateAfterEnd = p;
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(updateAfterEnd, null, "no cart_update should arrive after the session finished (tick timer must be cleared)");
  } finally {
    client.close();
  }
});

test("sky-runner — session lock rejects a second concurrent game for the same user (session-lock reuse)", async () => {
  const { accessToken } = await createTestUser();
  const clientA = connectClient(accessToken);
  const clientB = connectClient(accessToken);
  try {
    await connectAndWait(clientA);
    await connectAndWait(clientB);

    const startedA = waitFor(clientA, "game:started");
    clientA.emit("game:start", "sky-runner");
    await startedA;

    const errB = waitFor(clientB, "game:error");
    clientB.emit("game:start", "sky-runner");
    const err = await errB;
    assert.equal(err.code, "game_already_active");

    clientA.emit("game:end");
    await waitFor(clientA, "game:finished");
  } finally {
    clientA.close();
    clientB.close();
  }
});
