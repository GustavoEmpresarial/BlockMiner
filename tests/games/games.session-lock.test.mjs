import test from "node:test";
import assert from "node:assert/strict";

const lock = await import("../../server/modules/games/games.session-lock.ts");

test("tryAcquireUserGameSession blocks a second socket, allows the same one to re-acquire", () => {
  const ok1 = lock.tryAcquireUserGameSession(1, "crypto-memory", "sock-a");
  assert.equal(ok1, true);
  const blocked = lock.tryAcquireUserGameSession(1, "crypto-memory", "sock-b");
  assert.equal(blocked, false);
  const reacquire = lock.tryAcquireUserGameSession(1, "crypto-memory", "sock-a");
  assert.equal(reacquire, true);
  lock.releaseAllUserGameSessionsForSocket("sock-a");
});

test("releaseUserGameSession frees the lock for a different game slug independently", () => {
  lock.tryAcquireUserGameSession(2, "game-a", "sock-x");
  lock.tryAcquireUserGameSession(2, "game-b", "sock-y");
  lock.releaseUserGameSession(2, "game-a", "sock-x");
  assert.equal(lock.tryAcquireUserGameSession(2, "game-a", "sock-z"), true);
  assert.equal(lock.tryAcquireUserGameSession(2, "game-b", "sock-z"), false);
  lock.releaseAllUserGameSessionsForSocket("sock-y");
  lock.releaseAllUserGameSessionsForSocket("sock-z");
});
