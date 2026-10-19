/**
 * The audit middleware writes the audit_logs row; the request itself is already logged once by
 * the http_request line, so the audit must not print a second INFO line for the same request.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
import path from "node:path";

process.env.NODE_ENV = "development"; // logger + audit write are both skipped under NODE_ENV=test
process.env.LOG_LEVEL = "info";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const created = [];
let failWrite = false;
mock.module(pathToFileURL(path.join(root, "server/core/database/prisma.ts")).href, {
  defaultExport: {
    auditLog: {
      create: async (args) => {
        if (failWrite) throw new Error("db down");
        created.push(args.data);
        return {};
      },
    },
  },
});

const { createUserActivityAuditMiddleware } = await import("../../server/core/http/middleware/userActivityAudit.ts");
const mw = createUserActivityAuditMiddleware();

async function run(method, url) {
  const req = { method, originalUrl: url, url, user: { id: 42 }, headers: { "user-agent": "t" }, ip: "1.2.3.4" };
  const res = new EventEmitter();
  res.statusCode = 200;
  const lines = [];
  const orig = console.info;
  console.info = (l) => lines.push(JSON.parse(l));
  try {
    mw(req, res, () => {});
    res.emit("finish");
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    console.info = orig;
  }
  return lines;
}

test("a write is audited in the DB without a duplicate INFO log line", async () => {
  created.length = 0;
  failWrite = false;
  const lines = await run("POST", "/api/youtube/claim");
  assert.equal(created.length, 1);
  assert.equal(created[0].action, "USER_API_POST_YOUTUBE_CLAIM");
  assert.equal(created[0].userId, 42);
  assert.deepEqual(lines.filter((l) => l.level === "info"), []);
});

test("antibot telemetry is background noise: no audit row", async () => {
  created.length = 0;
  await run("POST", "/api/antibot/telemetry");
  assert.equal(created.length, 0);
});

test("a failed audit write is reported (WARN, stable code), never thrown", async () => {
  created.length = 0;
  failWrite = true;
  const lines = await run("POST", "/api/youtube/claim");
  failWrite = false;
  const warn = lines.find((l) => l.level === "warn");
  assert.ok(warn, "expected a warn line");
  assert.equal(warn.message, "USER_ACTIVITY_AUDIT_WRITE_FAILED");
  assert.equal(warn.details.action, "USER_API_POST_YOUTUBE_CLAIM");
});
