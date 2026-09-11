import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

const authTokens = await import("../../server/shared/security/authTokens.ts");
const socketAuth = await import("../../server/core/socket/socket.auth.ts");

test("evaluateExplicitSocketHandshakeToken: empty/absent token skips (no explicit auth)", () => {
  assert.deepEqual(socketAuth.evaluateExplicitSocketHandshakeToken(undefined), { kind: "skip" });
  assert.deepEqual(socketAuth.evaluateExplicitSocketHandshakeToken(""), { kind: "skip" });
  assert.deepEqual(socketAuth.evaluateExplicitSocketHandshakeToken("   "), { kind: "skip" });
  assert.deepEqual(socketAuth.evaluateExplicitSocketHandshakeToken(42), { kind: "skip" });
});

test("evaluateExplicitSocketHandshakeToken: malformed (non-JWT-shaped) token is rejected", () => {
  const result = socketAuth.evaluateExplicitSocketHandshakeToken("not-a-jwt");
  assert.equal(result.kind, "reject");
});

test("evaluateExplicitSocketHandshakeToken: JWT-shaped but invalid signature is rejected", () => {
  const fakeJwt = "aaa.bbb.ccc";
  const result = socketAuth.evaluateExplicitSocketHandshakeToken(fakeJwt);
  assert.equal(result.kind, "reject");
  assert.equal(result.message, "Unauthorized");
});

test("evaluateExplicitSocketHandshakeToken: valid access token resolves the real userId", () => {
  const token = authTokens.signAccessToken({ id: 777, name: "Test", email: "t@example.com" });
  const result = socketAuth.evaluateExplicitSocketHandshakeToken(token);
  assert.equal(result.kind, "ok");
  assert.equal(result.userId, 777);
});

test("attachSocketIoExplicitAuthMiddleware: registers a single io.use() middleware", () => {
  const calls = [];
  const fakeIo = { use: (fn) => calls.push(fn) };
  socketAuth.attachSocketIoExplicitAuthMiddleware(fakeIo);
  assert.equal(calls.length, 1);
});

test("attachSocketIoExplicitAuthMiddleware: allows connection through with no handshake token", () => {
  const calls = [];
  const fakeIo = { use: (fn) => calls.push(fn) };
  socketAuth.attachSocketIoExplicitAuthMiddleware(fakeIo);
  const [middleware] = calls;
  const socket = { handshake: { auth: {} }, data: {} };
  let nextArg = "not-called";
  middleware(socket, (err) => {
    nextArg = err;
  });
  assert.equal(nextArg, undefined);
});

test("attachSocketIoExplicitAuthMiddleware: rejects an explicit invalid JWT", () => {
  const calls = [];
  const fakeIo = { use: (fn) => calls.push(fn) };
  socketAuth.attachSocketIoExplicitAuthMiddleware(fakeIo);
  const [middleware] = calls;
  const socket = { handshake: { auth: { token: "aaa.bbb.ccc" } }, data: {} };
  let nextArg = "not-called";
  middleware(socket, (err) => {
    nextArg = err;
  });
  assert.ok(nextArg instanceof Error);
  assert.equal(nextArg.message, "Unauthorized");
});

test("attachSocketIoExplicitAuthMiddleware: accepts an explicit valid JWT and stamps socket.data", () => {
  const calls = [];
  const fakeIo = { use: (fn) => calls.push(fn) };
  socketAuth.attachSocketIoExplicitAuthMiddleware(fakeIo);
  const [middleware] = calls;
  const token = authTokens.signAccessToken({ id: 501, name: "X", email: "x@example.com" });
  const socket = { handshake: { auth: { token } }, data: {} };
  let nextArg = "not-called";
  middleware(socket, (err) => {
    nextArg = err;
  });
  assert.equal(nextArg, undefined);
  assert.equal(socket.data.handshakeAuthUserId, 501);
});
