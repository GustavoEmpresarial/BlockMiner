import test from "node:test";
import assert from "node:assert/strict";

const { sessionDetector } = await import("../../server/modules/antibot/detectors/session.detector.ts");

test("sessionDetector: anonymous user (userId null) skips persistence, no evidence", async () => {
  const calls = [];
  const prisma = { antibotSession: { upsert: async (args) => { calls.push(args); return {}; } } };
  const ev = await sessionDetector.detect({
    prisma,
    telemetry: {},
    userId: null,
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
    sessionId: "s1",
    eventType: "game:test",
  });
  assert.deepEqual(ev, []);
  assert.equal(calls.length, 0);
});

test("sessionDetector: logged-in user upserts a session row with parsed browser/os and returns no evidence", async () => {
  let upsertArgs = null;
  const prisma = {
    antibotSession: {
      upsert: async (args) => {
        upsertArgs = args;
        return {};
      },
    },
  };
  const ev = await sessionDetector.detect({
    prisma,
    telemetry: { device: { deviceId: "dev1", fingerprint: "fp1" }, environment: { platform: "Win32", language: "en-US" } },
    userId: 42,
    ip: "9.9.9.9",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
    sessionId: "sess-abc",
    eventType: "game:test",
  });
  assert.deepEqual(ev, []);
  assert.ok(upsertArgs, "upsert must be called");
  assert.deepEqual(upsertArgs.where, { userId_sessionId: { userId: 42, sessionId: "sess-abc" } });
  assert.equal(upsertArgs.create.browser, "Chrome");
  assert.equal(upsertArgs.create.os, "Windows");
  assert.equal(upsertArgs.create.deviceId, "dev1");
  assert.equal(upsertArgs.update.ip, "9.9.9.9");
});
