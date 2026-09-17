/**
 * HTTP-level tests for the tournaments read controller.
 *
 * The service layer is mocked, so these run with no database: what is under
 * test here is the controller's own behaviour — id validation, the 401/400/404
 * shapes, and above all the error path. Every handler used to end in a bare
 * `catch { res.status(500) }` that discarded the exception; these tests pin the
 * replacement: a 500 carries an `errorId` and the message never leaks internals.
 *
 * Requires --experimental-test-module-mocks (wired into the npm test script).
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const SERVICE = new URL(
  "../../server/modules/tournaments/tournaments.service.ts",
  import.meta.url,
).href;

/**
 * Mutable service behaviour, swapped per test.
 *
 * The mock is installed ONCE and the controller imported ONCE, rather than
 * re-mocking and re-importing per test with a cache-busting query: a fresh
 * module URL per test is a fresh module in the coverage report too, and the
 * real file then shows as barely covered no matter how much it is exercised.
 */
const impl = {};

mock.module(SERVICE, {
  namedExports: {
    listActiveTournaments: (...a) => impl.listActiveTournaments(...a),
    getTournamentWithLeaderboard: (...a) => impl.getTournamentWithLeaderboard(...a),
    getUserTournamentHistory: (...a) => impl.getUserTournamentHistory(...a),
    getMyTournamentScoreBreakdown: (...a) => impl.getMyTournamentScoreBreakdown(...a),
  },
});

const ctrl = await import("../../server/modules/tournaments/tournaments.controller.ts");

/** Installs this test's service behaviour, defaulting anything it does not name. */
function useService(overrides) {
  const unused = () => {
    throw new Error("service function called unexpectedly");
  };
  Object.assign(impl, {
    listActiveTournaments: unused,
    getTournamentWithLeaderboard: unused,
    getUserTournamentHistory: unused,
    getMyTournamentScoreBreakdown: unused,
    ...overrides,
  });
}

/** Minimal express double: records what the handler answered. */
function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function makeReq({ params = {}, user, headers = {} } = {}) {
  return { params, user, headers, query: {} };
}

const boom = () => {
  throw new Error("database exploded: relation \"Tournament\" does not exist");
};

// ─── id validation ───────────────────────────────────────────────────────────

test("getTournament rejects ids that are not positive integers", async () => {
  let called = false;
  useService({
    listActiveTournaments: async () => [],
    getTournamentWithLeaderboard: async () => {
      called = true;
      return null;
    },
    getUserTournamentHistory: async () => [],
    getMyTournamentScoreBreakdown: async () => null,
  });

  // parseInt would have accepted "-5" and turned "12abc" into 12; both used to
  // reach Prisma and come back as a 404.
  for (const bad of ["0", "-5", "12abc", "abc", "", "1.5", " "]) {
    const res = makeRes();
    await ctrl.getTournament(makeReq({ params: { id: bad } }), res);
    assert.equal(res.statusCode, 400, `id ${JSON.stringify(bad)} should be a 400`);
    assert.equal(res.body.ok, false);
  }
  assert.equal(called, false, "an invalid id must never reach the service");
});

test("getTournament accepts a well-formed id and passes it through as a number", async () => {
  let seen;
  useService({
    listActiveTournaments: async () => [],
    getTournamentWithLeaderboard: async (id, userId) => {
      seen = { id, userId };
      return { tournament: { id }, top: [] };
    },
    getUserTournamentHistory: async () => [],
    getMyTournamentScoreBreakdown: async () => null,
  });

  const res = makeRes();
  await ctrl.getTournament(makeReq({ params: { id: " 42 " }, user: { id: 7 } }), res);
  assert.deepEqual(seen, { id: 42, userId: 7 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
});

test("getTournament answers 404 when the tournament does not exist", async () => {
  useService({
    listActiveTournaments: async () => [],
    getTournamentWithLeaderboard: async () => null,
    getUserTournamentHistory: async () => [],
    getMyTournamentScoreBreakdown: async () => null,
  });
  const res = makeRes();
  await ctrl.getTournament(makeReq({ params: { id: "1" } }), res);
  assert.equal(res.statusCode, 404);
});

test("getTournament works for an anonymous caller", async () => {
  // The route has no requireAuth, so userId is undefined here by design.
  let seenUserId = "unset";
  useService({
    listActiveTournaments: async () => [],
    getTournamentWithLeaderboard: async (_id, userId) => {
      seenUserId = userId;
      return { tournament: {}, top: [] };
    },
    getUserTournamentHistory: async () => [],
    getMyTournamentScoreBreakdown: async () => null,
  });
  const res = makeRes();
  await ctrl.getTournament(makeReq({ params: { id: "1" } }), res);
  assert.equal(seenUserId, undefined);
  assert.equal(res.statusCode, 200);
});

// ─── auth guards ─────────────────────────────────────────────────────────────

test("the authed handlers answer 401 when req.user is missing", async () => {
  // requireAuth runs in front of these routes, but tournaments.routes.ts is
  // @ts-nocheck: if the middleware is ever reordered this must be a 401, not a
  // crash on a non-null assertion surfacing as an opaque 500.
  useService({
    listActiveTournaments: async () => [],
    getTournamentWithLeaderboard: async () => ({ myEntry: null, myRankLive: null }),
    getUserTournamentHistory: async () => [],
    getMyTournamentScoreBreakdown: async () => ({}),
  });

  for (const handler of ["myRank", "myHistory", "myScoreBreakdown"]) {
    const res = makeRes();
    await ctrl[handler](makeReq({ params: { id: "1" } }), res);
    assert.equal(res.statusCode, 401, `${handler} should refuse an unauthenticated caller`);
    assert.equal(res.body.ok, false);
  }
});

test("myRank returns only the caller's own entry, not the leaderboard", async () => {
  useService({
    listActiveTournaments: async () => [],
    getTournamentWithLeaderboard: async () => ({
      tournament: { id: 1, name: "secret" },
      top: [{ userId: 999, name: "someone else" }],
      myEntry: { id: 5, score: 10 },
      myRankLive: 3,
    }),
    getUserTournamentHistory: async () => [],
    getMyTournamentScoreBreakdown: async () => null,
  });

  const res = makeRes();
  await ctrl.myRank(makeReq({ params: { id: "1" }, user: { id: 7 } }), res);
  assert.deepEqual(res.body, { ok: true, myEntry: { id: 5, score: 10 }, myRankLive: 3 });
  assert.equal(res.body.top, undefined, "myRank must not echo the leaderboard back");
});

test("myScoreBreakdown validates the id after confirming auth", async () => {
  useService({
    listActiveTournaments: async () => [],
    getTournamentWithLeaderboard: async () => null,
    getUserTournamentHistory: async () => [],
    getMyTournamentScoreBreakdown: async () => null,
  });
  const res = makeRes();
  await ctrl.myScoreBreakdown(makeReq({ params: { id: "nope" }, user: { id: 7 } }), res);
  assert.equal(res.statusCode, 400);
});

test("myScoreBreakdown answers 404 when the metric has no breakdown", async () => {
  useService({
    listActiveTournaments: async () => [],
    getTournamentWithLeaderboard: async () => null,
    getUserTournamentHistory: async () => [],
    getMyTournamentScoreBreakdown: async () => null,
  });
  const res = makeRes();
  await ctrl.myScoreBreakdown(makeReq({ params: { id: "1" }, user: { id: 7 } }), res);
  assert.equal(res.statusCode, 404);
});

// ─── happy paths ─────────────────────────────────────────────────────────────

test("listTournaments and myHistory return their payloads", async () => {
  useService({
    listActiveTournaments: async () => [{ id: 1 }],
    getTournamentWithLeaderboard: async () => null,
    getUserTournamentHistory: async () => [{ id: 9 }],
    getMyTournamentScoreBreakdown: async () => ({ breakdown: { a: 1 } }),
  });

  const listRes = makeRes();
  await ctrl.listTournaments(makeReq(), listRes);
  assert.deepEqual(listRes.body, { ok: true, tournaments: [{ id: 1 }] });

  const histRes = makeRes();
  await ctrl.myHistory(makeReq({ user: { id: 7 } }), histRes);
  assert.deepEqual(histRes.body, { ok: true, history: [{ id: 9 }] });

  const bdRes = makeRes();
  await ctrl.myScoreBreakdown(makeReq({ params: { id: "1" }, user: { id: 7 } }), bdRes);
  assert.equal(bdRes.body.ok, true);
});

// ─── the error path — the reason this file exists ────────────────────────────

test("every handler answers 500 with an errorId when the service throws", async () => {
  useService({
    listActiveTournaments: boom,
    getTournamentWithLeaderboard: boom,
    getUserTournamentHistory: boom,
    getMyTournamentScoreBreakdown: boom,
  });

  const cases = [
    ["listTournaments", makeReq()],
    ["getTournament", makeReq({ params: { id: "1" } })],
    ["myRank", makeReq({ params: { id: "1" }, user: { id: 7 } })],
    ["myHistory", makeReq({ user: { id: 7 } })],
    ["myScoreBreakdown", makeReq({ params: { id: "1" }, user: { id: 7 } })],
  ];

  for (const [name, req] of cases) {
    const res = makeRes();
    await ctrl[name](req, res);
    assert.equal(res.statusCode, 500, `${name} should answer 500`);
    assert.equal(res.body.ok, false);
    assert.match(
      res.body.errorId,
      /^err_[0-9a-z]+$/,
      `${name} must hand back the occurrence id support asks the player for`,
    );
  }
});

test("a 500 never leaks the underlying error text to the caller", async () => {
  // GET /:id is unauthenticated: a Prisma message here would hand an anonymous
  // caller table names.
  useService({
    listActiveTournaments: boom,
    getTournamentWithLeaderboard: boom,
    getUserTournamentHistory: boom,
    getMyTournamentScoreBreakdown: boom,
  });

  const res = makeRes();
  await ctrl.getTournament(makeReq({ params: { id: "1" } }), res);
  const serialized = JSON.stringify(res.body);
  assert.doesNotMatch(serialized, /relation/i, "the Prisma error text reached the client");
  assert.doesNotMatch(serialized, /Tournament" does not exist/i);
  assert.doesNotMatch(serialized, /stack/i);
  assert.equal(res.body.message, "Failed to load tournament");
});

test("each handler reports a distinct errorId per occurrence", async () => {
  // error_id is per-occurrence, not per-problem — two failures must not collide,
  // or support cannot tell which one a player is quoting.
  useService({
    listActiveTournaments: boom,
    getTournamentWithLeaderboard: boom,
    getUserTournamentHistory: boom,
    getMyTournamentScoreBreakdown: boom,
  });

  const first = makeRes();
  const second = makeRes();
  await ctrl.listTournaments(makeReq(), first);
  await ctrl.listTournaments(makeReq(), second);
  assert.notEqual(first.body.errorId, second.body.errorId);
});

test("a rejected promise is handled the same as a synchronous throw", async () => {
  useService({
    listActiveTournaments: async () => {
      throw new Error("async boom");
    },
    getTournamentWithLeaderboard: async () => null,
    getUserTournamentHistory: async () => [],
    getMyTournamentScoreBreakdown: async () => null,
  });
  const res = makeRes();
  await ctrl.listTournaments(makeReq(), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.errorId, /^err_/);
});
