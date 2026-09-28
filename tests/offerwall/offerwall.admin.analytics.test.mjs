import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { getOfferwallAnalyticsReport } = await import("../../server/modules/offerwall/offerwall.service.ts");

test("Offerwall Analytics Integration: aggregates conversions across Internal, OfferwallMe, Multiwall and Zerads", async (t) => {
  const ts = Date.now();
  let userA = null;
  let userB = null;
  let internalOffer = null;
  let attemptA = null;
  let omeCbA = null;
  let multiCbA = null;
  let zeradsCbA = null;

  const now = new Date();
  const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

  try {
    // 1. Create two test users
    userA = await prisma.user.create({
      data: {
        name: "Analytics User A",
        username: `an_user_a_${ts}`.slice(0, 20),
        email: `an_user_a_${ts}@blockminer.test`,
        passwordHash: "dummy",
      },
    });

    userB = await prisma.user.create({
      data: {
        name: "Analytics User B",
        username: `an_user_b_${ts}`.slice(0, 20),
        email: `an_user_b_${ts}@blockminer.test`,
        passwordHash: "dummy",
      },
    });

    // 2. Create Internal Offer & Attempt for User A
    internalOffer = await prisma.internalOfferwallOffer.create({
      data: {
        title: `Offer A ${ts}`,
        kind: "GENERAL_TASK",
        completionMode: "AUTO_VIEW",
        rewardKind: "POL",
        rewardPolAmount: new Prisma.Decimal("0.05"),
        sortOrder: 1,
      },
    });

    attemptA = await prisma.internalOfferwallAttempt.create({
      data: {
        userId: userA.id,
        offerId: internalOffer.id,
        periodKey: "2026-09-28",
        status: "COMPLETED",
        startedAt: past,
        completedAt: past,
      },
    });

    // 3. Create OfferwallMe callback for User A
    omeCbA = await prisma.offerwallMeCallback.create({
      data: {
        userId: userA.id,
        transId: `ome_trans_${ts}`,
        offerName: "Survey 1",
        payoutUsd: 0.1,
        polCredited: 0.02,
        polPrice: 1.0,
        status: 1,
        createdAt: past,
      },
    });

    // 4. Create Multiwall callback for User A
    multiCbA = await prisma.multiwallCallback.create({
      data: {
        userId: userA.id,
        transId: `multi_trans_${ts}`,
        offerName: "App Install",
        payoutUsd: 0.2,
        polCredited: 0.04,
        polPrice: 1.0,
        status: 1,
        createdAt: past,
      },
    });

    // 5. Create Zerads callback for User A
    zeradsCbA = await prisma.zeradsCallback.create({
      data: {
        userId: userA.id,
        username: userA.username,
        amountZer: 0.01,
        exchangeRate: 0.0005,
        payoutAmount: 0.005,
        clicks: 3,
        requestIp: "127.0.0.1",
        callbackHash: `hash_${ts}`,
        callbackAt: past,
      },
    });

    // ── Test 1: Global aggregation within date range ──────────────────────────
    await t.test("Global report reflects aggregated conversions across all providers", async () => {
      const from = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
      const to = new Date(now.getTime() + 1000);

      const report = await getOfferwallAnalyticsReport({
        userId: null,
        from,
        to,
        serverNow: now.toISOString(),
      });

      assert.ok(report.totals);
      assert.ok(report.totals.internal.count >= 1);
      assert.ok(report.totals.offerwallMe.count >= 1);
      assert.ok(report.totals.multiwall.count >= 1);
      assert.ok(report.totals.zerads.callbacks >= 1);
      assert.ok(Array.isArray(report.daily));
      assert.ok(report.daily.length > 0);
      assert.ok(report.serverNowBrt, "serverNowBrt must be present");

      // Verify row structure
      const row = report.daily.find((r) => r.day === past.toISOString().slice(0, 10));
      assert.ok(row, "Daily row for test date must exist");
      assert.ok(row.dayBrt, "dayBrt must be populated in daily row");
    });

    // ── Test 2: User-scoped aggregation isolates by user ───────────────────────
    await t.test("User-scoped report isolates records to target user", async () => {
      const from = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
      const to = new Date(now.getTime() + 1000);

      const reportA = await getOfferwallAnalyticsReport({
        userId: userA.id,
        from,
        to,
        serverNow: now.toISOString(),
      });

      assert.equal(reportA.totals.internal.count, 1);
      assert.equal(reportA.totals.internal.pol, 0.05);
      assert.equal(reportA.totals.offerwallMe.count, 1);
      assert.equal(reportA.totals.offerwallMe.pol, 0.02);
      assert.equal(reportA.totals.multiwall.count, 1);
      assert.equal(reportA.totals.multiwall.pol, 0.04);
      assert.equal(reportA.totals.zerads.callbacks, 1);
      assert.equal(reportA.totals.zerads.clicks, 3);
      assert.equal(reportA.totals.zerads.pol, 0.005);

      // Report for User B (has no conversions)
      const reportB = await getOfferwallAnalyticsReport({
        userId: userB.id,
        from,
        to,
        serverNow: now.toISOString(),
      });

      assert.equal(reportB.totals.internal.count, 0);
      assert.equal(reportB.totals.offerwallMe.count, 0);
      assert.equal(reportB.totals.multiwall.count, 0);
      assert.equal(reportB.totals.zerads.callbacks, 0);
      assert.equal(reportB.daily.length, 0);
    });
  } finally {
    // Cleanup
    if (attemptA?.id) {
      await prisma.internalOfferwallAttempt.delete({ where: { id: attemptA.id } }).catch(() => {});
    }
    if (internalOffer?.id) {
      await prisma.internalOfferwallOffer.delete({ where: { id: internalOffer.id } }).catch(() => {});
    }
    if (omeCbA?.id) {
      await prisma.offerwallMeCallback.delete({ where: { id: omeCbA.id } }).catch(() => {});
    }
    if (multiCbA?.id) {
      await prisma.multiwallCallback.delete({ where: { id: multiCbA.id } }).catch(() => {});
    }
    if (zeradsCbA?.id) {
      await prisma.zeradsCallback.delete({ where: { id: zeradsCbA.id } }).catch(() => {});
    }
    if (userA?.id) {
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => {});
    }
    if (userB?.id) {
      await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});
    }
  }
});
