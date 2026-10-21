/**
 * Graceful shutdown: a restart used to disconnect Prisma while requests / cron transactions were
 * still running ("Transaction not found" on a YouTube claim and an energy-tax charge in the last two
 * deploys). The DB may only close after in-flight HTTP and checked-out pool clients drain.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const { trackInFlightRequests, drainAndClose } = await import("../../server/bootstrap/shutdown.ts");

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function get(server, path = "/") {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path, agent: new http.Agent({ keepAlive: true }) }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body, connection: res.headers.connection }));
    });
    req.on("error", reject);
  });
}

const quietLog = { info() {}, warn() {}, error() {} };

test("waits for an in-flight request before disconnecting the DB", async () => {
  const order = [];
  let release;
  const server = await listen((req, res) => {
    release = () => {
      order.push("response");
      res.end("ok");
    };
  });
  const tracker = trackInFlightRequests(server);
  const pending = get(server);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(tracker.inFlight(), 1);

  const done = drainAndClose({
    server,
    tracker,
    stopJobs: () => order.push("jobs"),
    dbBusy: () => 0,
    disconnect: async () => order.push("disconnect"),
    log: quietLog,
    timeoutMs: 2000,
    pollMs: 10,
  });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(order, ["jobs"], "must not disconnect while the request is running");
  release();
  const res = await pending;
  const result = await done;
  assert.equal(res.status, 200);
  assert.equal(res.connection, "close", "responses during drain tell keep-alive clients to reconnect elsewhere");
  assert.deepEqual(order, ["jobs", "response", "disconnect"]);
  assert.equal(result.drained, true);
});

test("waits for checked-out DB clients (cron transactions) too", async () => {
  const server = await listen((req, res) => res.end("ok"));
  const tracker = trackInFlightRequests(server);
  let busy = 1;
  setTimeout(() => (busy = 0), 60);
  let disconnectedWhileBusy = null;
  const result = await drainAndClose({
    server,
    tracker,
    stopJobs: () => {},
    dbBusy: () => busy,
    disconnect: async () => {
      disconnectedWhileBusy = busy > 0;
    },
    log: quietLog,
    timeoutMs: 2000,
    pollMs: 10,
  });
  assert.equal(disconnectedWhileBusy, false);
  assert.equal(result.drained, true);
  assert.ok(result.waitedMs >= 50);
});

test("gives up after the timeout, reports it, and still disconnects", async () => {
  const server = await listen(() => {}); // never answers
  const tracker = trackInFlightRequests(server);
  const pending = get(server).catch(() => null);
  await new Promise((r) => setTimeout(r, 30));
  const warns = [];
  let disconnected = false;
  const result = await drainAndClose({
    server,
    tracker,
    stopJobs: () => {},
    dbBusy: () => 2,
    disconnect: async () => {
      disconnected = true;
    },
    log: { ...quietLog, warn: (msg, d) => warns.push({ msg, d }) },
    timeoutMs: 120,
    pollMs: 10,
  });
  assert.equal(result.drained, false);
  assert.equal(disconnected, true);
  assert.equal(warns[0].msg, "SHUTDOWN_DRAIN_TIMEOUT");
  assert.equal(warns[0].d.inFlight, 1);
  assert.equal(warns[0].d.dbBusy, 2);
  server.closeAllConnections();
  await pending;
});

test("stops accepting new connections once draining", async () => {
  const server = await listen((req, res) => res.end("ok"));
  const tracker = trackInFlightRequests(server);
  const { port } = server.address();
  await drainAndClose({ server, tracker, stopJobs: () => {}, dbBusy: () => 0, disconnect: async () => {}, log: quietLog, timeoutMs: 500, pollMs: 10 });
  await assert.rejects(
    new Promise((resolve, reject) => http.get({ host: "127.0.0.1", port, path: "/" }, resolve).on("error", reject)),
    /ECONNREFUSED/,
  );
});
