import test from "node:test";
import assert from "node:assert/strict";

const { CheckinHttpError, mapCheckinError } = await import("../../server/modules/checkin/checkin.errors.ts");

test("CheckinHttpError — carries code and message", () => {
  const err = new CheckinHttpError("WALLET_REQUIRED", "wallet");
  assert.equal(err.code, "WALLET_REQUIRED");
  assert.equal(err.name, "CheckinHttpError");
  assert.ok(err instanceof Error);
});

test("mapCheckinError — maps known CheckinHttpError codes to HTTP responses", () => {
  const cases = [
    ["CHECKIN_PENDING_PAYMENT", 409],
    ["INSUFFICIENT_BALANCE", 400],
    ["WALLET_REQUIRED", 400],
    ["FORBIDDEN", 403],
  ];
  for (const [code, status] of cases) {
    const mapped = mapCheckinError(new CheckinHttpError(code, "x"));
    assert.ok(mapped, `expected mapping for ${code}`);
    assert.equal(mapped.status, status);
    assert.equal(mapped.code, code);
  }
});

test("mapCheckinError — unknown CheckinHttpError code returns null", () => {
  const mapped = mapCheckinError(new CheckinHttpError("SOMETHING_ELSE", "x"));
  assert.equal(mapped, null);
});

test("mapCheckinError — P2002 maps to CHECKIN_CONFLICT 409", () => {
  const mapped = mapCheckinError({ code: "P2002" });
  assert.equal(mapped.status, 409);
  assert.equal(mapped.code, "CHECKIN_CONFLICT");
});

test("mapCheckinError — DISTRIBUTED_LOCK_BUSY / P2034 maps to CHECKIN_BUSY 409", () => {
  assert.equal(mapCheckinError({ code: "DISTRIBUTED_LOCK_BUSY" }).code, "CHECKIN_BUSY");
  assert.equal(mapCheckinError({ code: "P2034" }).code, "CHECKIN_BUSY");
});

test("mapCheckinError — unrelated error returns null", () => {
  assert.equal(mapCheckinError(new Error("random")), null);
  assert.equal(mapCheckinError(null), null);
});

test("payStreakRecovery — responds 400 INVALID_CURRENCY when body.currency is unsupported (e.g. ETH)", async () => {
  const checkinCtrl = await import("../../server/modules/checkin/checkin.controller.ts");
  const calls = { status: 200, json: null };
  const res = {
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
  };
  const req = {
    user: { id: 1, name: "Checkin Tester", email: "checkin@test.com" },
    body: { currency: "ETH" },
  };
  await checkinCtrl.payStreakRecovery(req, res);
  assert.equal(calls.status, 400);
  assert.equal(calls.json.code, "INVALID_CURRENCY");
  assert.ok(calls.json.message?.includes("Moeda inválida"));
});
