import test from "node:test";
import assert from "node:assert/strict";

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { getPartsOverview } = await import("../../server/modules/parts/parts.service.ts");
const { DEFAULT_ACTIVITY_PART_DROP_BASE_BPS, DEFAULT_FREQUENT_ACTIVITY_DROP_BASE_BPS, OFFERWALL_MICRO_DROP_BPS } =
  await import("../../server/modules/parts/parts.drop.ts");

let userId;
test.after(async () => {
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
});

test("parts overview exposes the live drop rates used by the free-parts guide", async () => {
  const suffix = `pod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      name: "Parts Overview Rates",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "127.0.0.1",
      ip: "127.0.0.1",
      userAgent: "test-runner/1.0",
    },
  });
  userId = user.id;

  const overview = await getPartsOverview(user.id);
  assert.deepEqual(overview.dropRates, {
    activityBps: DEFAULT_ACTIVITY_PART_DROP_BASE_BPS,
    frequentActivityBps: DEFAULT_FREQUENT_ACTIVITY_DROP_BASE_BPS,
    offerwallMicroBps: OFFERWALL_MICRO_DROP_BPS,
  });
});
