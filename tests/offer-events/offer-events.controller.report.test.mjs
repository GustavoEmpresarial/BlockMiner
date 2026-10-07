import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.NODE_ENV = "development";
process.env.DATABASE_URL = "postgresql://blockminer:unused@127.0.0.1:1/blockminer";
process.env.LOG_LEVEL = "error";

const captured = [];
const originalInfo = console.info.bind(console);
console.info = (...args) => {
  captured.push(args.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" "));
  originalInfo(...args);
};

test("listActiveOfferEvents reports a database failure and returns only errorId", async () => {
  const { listActiveOfferEvents } = await import(
    "../../server/modules/offer-events/offer-events.controller.ts"
  );
  const express = (await import("express")).default;
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: 1 };
    next();
  });
  app.get("/offer-events", (req, res) => listActiveOfferEvents(req, res));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/offer-events`, {
      headers: { "x-request-id": "proof-offer-events-1" },
    });
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.ok, false);
    assert.equal(body.message, "Unable to load offer events.");
    assert.match(body.errorId, /^err_[0-9a-z]+$/);
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes("stack"), false);
    assert.equal(serialized.includes("prisma"), false);
    assert.equal(serialized.includes("ECONNREFUSED"), false);
    assert.equal(serialized.includes("DATABASE_URL"), false);
    assert.deepEqual(Object.keys(body).sort(), ["errorId", "message", "ok"]);

    const line = captured.find((entry) => entry.includes("OFFER_EVENTS_LIST_FAILED"));
    assert.ok(line, "expected a reportError log line");
    const record = JSON.parse(line);
    const details = record.details;
    assert.equal(record.message, "OFFER_EVENTS_LIST_FAILED");
    assert.equal(details.error_id, body.errorId);
    assert.match(details.fingerprint, /^fp_[0-9a-f]+$/);
    assert.equal(details.module, "offer-events");
    assert.equal(details.operation, "listActiveOfferEvents");
    assert.equal(details.request_id, "proof-offer-events-1");
    assert.equal(details.context.userId, 1);
    assert.equal(JSON.stringify(details.context).includes("authorization"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
