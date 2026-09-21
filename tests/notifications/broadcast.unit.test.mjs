import test from "node:test";
import assert from "node:assert/strict";
import * as broadcastService from "../../server/modules/notifications/broadcast.service.js";
import prisma from "../../server/core/database/prisma.js";

test("Broadcast Service — Lifecycle, reset views and dismissal", async (t) => {
  let createdBroadcastId = null;
  let testUserId1 = null;
  let testUserId2 = null;

  t.before(async () => {
    // Create test user 1
    const u1 = await prisma.user.create({
      data: {
        name: "Test User 1",
        username: `test_bc_u1_${Date.now()}`,
        email: `test_bc_u1_${Date.now()}@blockminer.test`,
        passwordHash: "test_hash",
        walletAddress: `0xbc0001_${Date.now()}`.slice(0, 42),
      },
    });
    testUserId1 = u1.id;

    // Create test user 2
    const u2 = await prisma.user.create({
      data: {
        name: "Test User 2",
        username: `test_bc_u2_${Date.now()}`,
        email: `test_bc_u2_${Date.now()}@blockminer.test`,
        passwordHash: "test_hash",
        walletAddress: `0xbc0002_${Date.now()}`.slice(0, 42),
      },
    });
    testUserId2 = u2.id;
  });

  t.after(async () => {
    // Clean up
    if (createdBroadcastId) {
      await prisma.broadcastMessageView.deleteMany({ where: { messageId: createdBroadcastId } }).catch(() => {});
      await prisma.broadcastMessage.delete({ where: { id: createdBroadcastId } }).catch(() => {});
    }
    if (testUserId1) {
      await prisma.user.delete({ where: { id: testUserId1 } }).catch(() => {});
    }
    if (testUserId2) {
      await prisma.user.delete({ where: { id: testUserId2 } }).catch(() => {});
    }
  });

  await t.test("createBroadcastMessage creates an active broadcast", async () => {
    // Ensure all previous are inactive
    await broadcastService.deactivateAllBroadcastMessages();

    const created = await broadcastService.createBroadcastMessage({
      title: "Unit Test Broadcast Notification",
      content: "Important notice about platform upgrades",
      imageUrl: "https://blockminer.space/assets/test.png",
      isActive: true,
      dismissDelaySeconds: 5,
      linkUrl: "/shop",
      linkLabel: "Visit Shop",
      linkNewTab: false,
    });

    assert.ok(created.id > 0);
    assert.equal(created.title, "Unit Test Broadcast Notification");
    assert.equal(created.isActive, true);
    assert.equal(created.dismissDelaySeconds, 5);
    createdBroadcastId = created.id;
  });

  await t.test("findBroadcastMessageById retrieves message with view count", async () => {
    const found = await broadcastService.findBroadcastMessageById(createdBroadcastId);
    assert.ok(found);
    assert.equal(found.id, createdBroadcastId);
    assert.equal(found._count.views, 0);
  });

  await t.test("getActiveBroadcastForUser returns active message if not dismissed", async () => {
    const active1 = await broadcastService.getActiveBroadcastForUser(testUserId1);
    assert.ok(active1);
    assert.equal(active1.id, createdBroadcastId);

    const active2 = await broadcastService.getActiveBroadcastForUser(testUserId2);
    assert.ok(active2);
    assert.equal(active2.id, createdBroadcastId);
  });

  await t.test("dismissBroadcastForUser marks message as viewed for user 1 only", async () => {
    await broadcastService.dismissBroadcastForUser(testUserId1, createdBroadcastId);

    // User 1 should now get null
    const active1 = await broadcastService.getActiveBroadcastForUser(testUserId1);
    assert.equal(active1, null);

    // User 2 should STILL get the message
    const active2 = await broadcastService.getActiveBroadcastForUser(testUserId2);
    assert.ok(active2);
    assert.equal(active2.id, createdBroadcastId);

    // View count should be 1
    const found = await broadcastService.findBroadcastMessageById(createdBroadcastId);
    assert.equal(found._count.views, 1);
  });

  await t.test("dismissBroadcastForUser is idempotent (upsert handles duplicates gracefully)", async () => {
    await broadcastService.dismissBroadcastForUser(testUserId1, createdBroadcastId);
    await broadcastService.dismissBroadcastForUser(testUserId1, createdBroadcastId);

    const found = await broadcastService.findBroadcastMessageById(createdBroadcastId);
    assert.equal(found._count.views, 1);
  });

  await t.test("resetBroadcastViews clears views and makes message active again for user 1", async () => {
    const cleared = await broadcastService.resetBroadcastViews(createdBroadcastId);
    assert.equal(cleared, 1);

    // Now user 1 can see it again!
    const active1 = await broadcastService.getActiveBroadcastForUser(testUserId1);
    assert.ok(active1);
    assert.equal(active1.id, createdBroadcastId);

    // Views count is back to 0
    const found = await broadcastService.findBroadcastMessageById(createdBroadcastId);
    assert.equal(found._count.views, 0);
  });

  await t.test("deactivateOtherBroadcastMessages keeps only designated broadcast active", async () => {
    const msg2 = await broadcastService.createBroadcastMessage({
      title: "Second Broadcast",
      isActive: true,
      dismissDelaySeconds: 0,
    });

    await broadcastService.deactivateOtherBroadcastMessages(msg2.id);

    const check1 = await broadcastService.findBroadcastMessageById(createdBroadcastId);
    assert.equal(check1.isActive, false);

    const check2 = await broadcastService.findBroadcastMessageById(msg2.id);
    assert.equal(check2.isActive, true);

    await broadcastService.deleteBroadcastMessage(msg2.id);
  });
});
