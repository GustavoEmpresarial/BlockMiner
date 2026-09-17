/**
 * Admin controller security + error-path tests (no DB).
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const prismaSpec = pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href;
const errorsSpec = pathToFileURL(path.join(root, "server/core/errors/index.ts")).href;
const serviceSpec = pathToFileURL(path.join(root, "server/modules/tournaments/tournaments.service.ts")).href;
const metricsSpec = pathToFileURL(path.join(root, "server/modules/tournaments/tournaments.metrics.ts")).href;
const driftSpec = pathToFileURL(
  path.join(root, "server/modules/tournaments/tournaments.offerwall-drift.ts"),
).href;
const validSpec = pathToFileURL(
  path.join(root, "server/modules/tournaments/tournaments.valid-metrics.ts"),
).href;

const serviceImpl = {};
const reported = [];

mock.module(prismaSpec, {
  defaultExport: {},
});
mock.module(errorsSpec, {
  namedExports: {
    reportError: (input) => {
      reported.push(input);
      return { errorId: "err_test", fingerprint: "fp_test" };
    },
  },
});
mock.module(serviceSpec, {
  namedExports: {
    adminListTournaments: (...a) => serviceImpl.adminListTournaments(...a),
    adminCreateTournament: (...a) => serviceImpl.adminCreateTournament(...a),
    adminUpdateTournament: (...a) => serviceImpl.adminUpdateTournament(...a),
    adminCancelTournament: (...a) => serviceImpl.adminCancelTournament(...a),
    adminGetEntries: (...a) => serviceImpl.adminGetEntries(...a),
    finalizeTournament: (...a) => serviceImpl.finalizeTournament(...a),
    adminTournamentScoreAudit: (...a) => serviceImpl.adminTournamentScoreAudit(...a),
    adminTournamentScoreAuditUser: (...a) => serviceImpl.adminTournamentScoreAuditUser(...a),
    getTypeDisplayOrder: (...a) => serviceImpl.getTypeDisplayOrder(...a),
    setTypeDisplayOrder: (...a) => serviceImpl.setTypeDisplayOrder(...a),
  },
});
mock.module(metricsSpec, {
  namedExports: { getEngineStats: async () => null },
});
mock.module(driftSpec, {
  namedExports: { listRecentDriftAlerts: async () => [] },
});
mock.module(validSpec, {
  namedExports: {
    isTournamentValidMetric: () => true,
    TOURNAMENT_VALID_METRICS: ["FAUCET"],
  },
});

const admin = await import("../../server/modules/tournaments/tournaments.admin.controller.ts");
const routes = await import("../../server/modules/tournaments/tournaments.admin.routes.ts");

function makeRes() {
  return {
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
}

function makeReq({ params = {}, query = {}, body = {} } = {}) {
  return { params, query, body, headers: {} };
}

function resetService() {
  reported.length = 0;
  const boom = async () => {
    throw new Error('prisma exploded: relation "TournamentPrize" does not exist');
  };
  Object.assign(serviceImpl, {
    adminListTournaments: boom,
    adminCreateTournament: boom,
    adminUpdateTournament: boom,
    adminCancelTournament: boom,
    adminGetEntries: async () => ({ entries: [], total: 0, page: 1, limit: 50 }),
    finalizeTournament: boom,
    adminTournamentScoreAudit: boom,
    adminTournamentScoreAuditUser: boom,
    getTypeDisplayOrder: boom,
    setTypeDisplayOrder: boom,
  });
}

test("clampAdminEntriesPagination rejects page<=0 and caps limit", () => {
  assert.deepEqual(admin.clampAdminEntriesPagination("0", "50"), { page: 1, limit: 50 });
  assert.deepEqual(admin.clampAdminEntriesPagination("-5", "9999"), { page: 1, limit: 200 });
  assert.deepEqual(admin.clampAdminEntriesPagination("3", "10"), { page: 3, limit: 10 });
  assert.deepEqual(admin.clampAdminEntriesPagination("abc", "xyz"), { page: 1, limit: 50 });
});

test("entries uses clamped page and never returns Prisma text on failure", async () => {
  resetService();
  serviceImpl.adminGetEntries = async () => {
    throw new Error('Invalid `skip` value: -50. Expected Int.');
  };
  const res = makeRes();
  await admin.entries(makeReq({ params: { id: "7" }, query: { page: "-1" } }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.errorId, "err_test");
  assert.equal(res.body.message, "Tournament admin operation failed");
  assert.ok(!String(JSON.stringify(res.body)).toLowerCase().includes("prisma"));
  assert.ok(!String(JSON.stringify(res.body)).includes("skip"));
  assert.equal(reported.length, 1);
});

test("update surfaces ACTIVE_IMMUTABLE_FIELDS without leaking internals", async () => {
  resetService();
  serviceImpl.adminUpdateTournament = async () => {
    throw Object.assign(
      new Error("Cannot change metric, dates, type, or prizes on an ACTIVE tournament"),
      { code: "TOURNAMENT_ACTIVE_IMMUTABLE_FIELDS", status: 400 },
    );
  };
  const res = makeRes();
  await admin.update(makeReq({ params: { id: "9" }, body: { metric: "FAUCET" } }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "TOURNAMENT_ACTIVE_IMMUTABLE_FIELDS");
  assert.equal(res.body.errorId, "err_test");
});

test("listAll failure reports errorId and redacts message", async () => {
  resetService();
  const res = makeRes();
  await admin.listAll(makeReq(), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.errorId, "err_test");
  assert.ok(!String(JSON.stringify(res.body)).includes("TournamentPrize"));
});

test("shadowAlerts handler is removed from admin controller", () => {
  assert.equal(typeof admin.shadowAlerts, "undefined");
});

test("admin routes no longer register shadow-alerts", () => {
  const stack = routes.tournamentsAdminRouter.stack ?? [];
  const paths = stack.map((layer) => layer?.route?.path).filter(Boolean);
  assert.ok(!paths.includes("/:id/shadow-alerts"));
});

test("admin finalize route is rate-limited separately", () => {
  const stack = routes.tournamentsAdminRouter.stack ?? [];
  const finalize = stack.find((layer) => layer?.route?.path === "/:id/finalize");
  assert.ok(finalize, "finalize route must exist");
  assert.ok((finalize.route.stack?.length ?? 0) >= 2);
});

test("restore module mocks after admin controller suite", () => {
  mock.restoreAll();
});
