import test from "node:test";
import assert from "node:assert/strict";
import * as broadcastService from "../../server/modules/notifications/broadcast.service.js";
import prisma from "../../server/core/database/prisma.js";

test("Broadcast End-to-End Lifecycle — Full Player & Admin Flows", async (t) => {
  let broadcastId = null;
  let user1 = null;
  let user2 = null;

  t.before(async () => {
    user1 = await prisma.user.create({
      data: {
        name: "E2E User 1",
        username: `e2e_bc_user1_${Date.now()}`,
        email: `e2e_bc_user1_${Date.now()}@blockminer.test`,
        passwordHash: "hash123",
        walletAddress: `0xe2e001_${Date.now()}`.slice(0, 42),
      },
    });

    user2 = await prisma.user.create({
      data: {
        name: "E2E User 2",
        username: `e2e_bc_user2_${Date.now()}`,
        email: `e2e_bc_user2_${Date.now()}@blockminer.test`,
        passwordHash: "hash123",
        walletAddress: `0xe2e002_${Date.now()}`.slice(0, 42),
      },
    });
  });

  t.after(async () => {
    if (broadcastId) {
      await prisma.broadcastMessageView.deleteMany({ where: { messageId: broadcastId } }).catch(() => {});
      await prisma.broadcastMessage.delete({ where: { id: broadcastId } }).catch(() => {});
    }
    if (user1) await prisma.user.delete({ where: { id: user1.id } }).catch(() => {});
    if (user2) await prisma.user.delete({ where: { id: user2.id } }).catch(() => {});
  });

  await t.test("Step 1: Admin creates active broadcast message", async () => {
    await broadcastService.deactivateAllBroadcastMessages();

    const created = await broadcastService.createBroadcastMessage({
      title: "E2E Test: New Tournament Live",
      content: "Join the hourly crypto mining tournament now!",
      imageUrl: "https://blockminer.space/assets/tournament.png",
      isActive: true,
      dismissDelaySeconds: 5,
      linkUrl: "/tournaments",
      linkLabel: "Join Tournament",
      linkNewTab: false,
    });

    assert.ok(created.id > 0);
    broadcastId = created.id;
  });

  await t.test("Step 2: Admin list includes created broadcast with 0 views", async () => {
    const list = await broadcastService.listBroadcastMessages();
    const item = list.find((m) => m.id === broadcastId);
    assert.ok(item);
    assert.equal(item.title, "E2E Test: New Tournament Live");
    assert.equal(item._count.views, 0);
  });

  await t.test("Step 3: User 1 and User 2 both see the active broadcast", async () => {
    const activeU1 = await broadcastService.getActiveBroadcastForUser(user1.id);
    assert.ok(activeU1);
    assert.equal(activeU1.id, broadcastId);

    const activeU2 = await broadcastService.getActiveBroadcastForUser(user2.id);
    assert.ok(activeU2);
    assert.equal(activeU2.id, broadcastId);
  });

  await t.test("Step 4: User 1 dismisses the broadcast", async () => {
    await broadcastService.dismissBroadcastForUser(user1.id, broadcastId);

    // User 1 should get null now
    const activeU1 = await broadcastService.getActiveBroadcastForUser(user1.id);
    assert.equal(activeU1, null);

    // User 2 should STILL see the active broadcast
    const activeU2 = await broadcastService.getActiveBroadcastForUser(user2.id);
    assert.ok(activeU2);
    assert.equal(activeU2.id, broadcastId);
  });

  await t.test("Step 5: User 2 dismisses the broadcast", async () => {
    await broadcastService.dismissBroadcastForUser(user2.id, broadcastId);

    // User 2 should now get null
    const activeU2 = await broadcastService.getActiveBroadcastForUser(user2.id);
    assert.equal(activeU2, null);

    // Views count should now be 2
    const found = await broadcastService.findBroadcastMessageById(broadcastId);
    assert.equal(found._count.views, 2);
  });

  await t.test("Step 6: Admin resets views -> Both users receive the popup again", async () => {
    const cleared = await broadcastService.resetBroadcastViews(broadcastId);
    assert.equal(cleared, 2);

    const activeU1 = await broadcastService.getActiveBroadcastForUser(user1.id);
    assert.ok(activeU1);
    assert.equal(activeU1.id, broadcastId);

    const activeU2 = await broadcastService.getActiveBroadcastForUser(user2.id);
    assert.ok(activeU2);
    assert.equal(activeU2.id, broadcastId);
  });

  await t.test("Step 7: Admin deactivates broadcast -> Both users get null", async () => {
    await broadcastService.updateBroadcastMessage(broadcastId, { isActive: false });

    const activeU1 = await broadcastService.getActiveBroadcastForUser(user1.id);
    assert.equal(activeU1, null);

    const activeU2 = await broadcastService.getActiveBroadcastForUser(user2.id);
    assert.equal(activeU2, null);
  });

  await t.test("Step 8: Admin deletes broadcast -> Message is removed and cascade cleanup works", async () => {
    await broadcastService.deleteBroadcastMessage(broadcastId);

    const found = await broadcastService.findBroadcastMessageById(broadcastId);
    assert.equal(found, null);

    // Verify cascade cleaned views
    const orphanedViews = await prisma.broadcastMessageView.count({
      where: { messageId: broadcastId },
    });
    assert.equal(orphanedViews, 0);

    broadcastId = null;
  });
});
