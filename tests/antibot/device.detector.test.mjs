import test from "node:test";
import assert from "node:assert/strict";

const { deviceDetector } = await import("../../server/modules/antibot/detectors/device.detector.ts");

function fakePrisma(accountCount) {
  return {
    antibotDevice: {
      upsert: async () => ({ accountCount }),
      update: async () => ({ accountCount }),
    },
    antibotSession: {
      groupBy: async () => Array.from({ length: accountCount }, (_, i) => ({ userId: i + 1 })),
    },
  };
}

test("deviceDetector: no deviceId in telemetry → no-op, no evidence", async () => {
  const ev = await deviceDetector.detect({
    prisma: fakePrisma(0),
    telemetry: {},
    userId: 1,
    ip: "1.2.3.4",
    userAgent: "",
    sessionId: "s1",
    eventType: "game:test",
  });
  assert.deepEqual(ev, []);
});

test("deviceDetector: device shared by < 3 accounts → no evidence", async () => {
  const ev = await deviceDetector.detect({
    prisma: fakePrisma(2),
    telemetry: { device: { deviceId: "dev1" } },
    userId: 1,
    ip: "1.2.3.4",
    userAgent: "",
    sessionId: "s1",
    eventType: "game:test",
  });
  assert.deepEqual(ev, []);
});

test("deviceDetector: device shared by >= 3 accounts → shared_device_many_accounts evidence with accountCount metadata", async () => {
  const ev = await deviceDetector.detect({
    prisma: fakePrisma(4),
    telemetry: { device: { deviceId: "dev1" } },
    userId: 1,
    ip: "1.2.3.4",
    userAgent: "",
    sessionId: "s1",
    eventType: "game:test",
  });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].code, "shared_device_many_accounts");
  assert.equal(ev[0].metadata.accountCount, 4);
  assert.equal(ev[0].metadata.deviceId, "dev1");
});
