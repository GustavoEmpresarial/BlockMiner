/**
 * Smoke: burn start destroys machines immediately; after duration claim lands in reward inbox.
 *
 * Product default burn wait is DEFAULT_BURN_PROCESS_DURATION_SECONDS (15 min).
 * This smoke shortens the wait via BURN_PROCESS_DURATION_SECONDS so the gate is still
 * exercised without sleeping a full quarter-hour.
 *
 * Skips when DATABASE_URL is unset / Prisma cannot connect.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

const hasDb = Boolean(String(process.env.DATABASE_URL || "").trim());

/** Short burn clock for smoke only — still goes through readBurnProcessDurationSeconds. */
const SMOKE_BURN_DURATION_SECONDS = 30;

describe("burn-events claim → reward inbox smoke (DB)", { skip: !hasDb }, () => {
  /** @type {import('@prisma/client').PrismaClient | null} */
  let prisma = null;
  let userId = 0;
  let rewardMinerId = 0;
  let eventId = 0;
  /** @type {number[]} */
  let burnMachineIds = [];
  let rackMachineId = 0;
  const tag = `smoke-burn-${Date.now()}`;
  const prevDuration = process.env.BURN_PROCESS_DURATION_SECONDS;

  before(async () => {
    process.env.BURN_PROCESS_DURATION_SECONDS = String(SMOKE_BURN_DURATION_SECONDS);
    try {
      const { default: prismaMod } = await import("../../server/core/database/prisma.ts");
      prisma = prismaMod;
      const user = await prisma.user.create({
        data: {
          name: tag.slice(0, 40),
          email: `${tag}@example.test`,
          username: tag.slice(0, 24),
          passwordHash: "smoke-test-not-a-login",
          shibBalance: 100,
          polBalance: 1,
          blkBalance: 1,
        },
        select: { id: true },
      });
      userId = user.id;
    } catch (err) {
      prisma = null;
      userId = 0;
      console.warn(
        "[burn-events smoke] skip — DB/Prisma unavailable:",
        err instanceof Error ? err.message : String(err),
      );
    }
  });

  after(async () => {
    if (prevDuration === undefined) delete process.env.BURN_PROCESS_DURATION_SECONDS;
    else process.env.BURN_PROCESS_DURATION_SECONDS = prevDuration;

    if (!prisma) return;
    if (eventId) {
      await prisma.$executeRaw`DELETE FROM burn_sessions WHERE event_id = ${eventId}`.catch(() => {});
      await prisma.burnClaim.deleteMany({ where: { eventId } }).catch(() => {});
      await prisma.burnEvent.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (userId) {
      await prisma.userRewardInbox.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userInventory.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userVault.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userMiner.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userOwnedMachine.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    if (rewardMinerId) {
      await prisma.miner.delete({ where: { id: rewardMinerId } }).catch(() => {});
    }
  });

  it("rejects claim before burn completes; after wait reward is pending inbox only", async (t) => {
    if (!prisma || !userId) {
      t.skip("DATABASE_URL / Prisma unavailable in this environment");
      return;
    }

    const {
      DEFAULT_BURN_PROCESS_DURATION_SECONDS,
      BURN_PROCESS_DURATION_ENV_KEY,
      readBurnProcessDurationSeconds,
      BURN_FEE_RATES,
    } = await import("../../server/modules/burn-events/burn-events.config.ts");
    const burnService = await import("../../server/modules/burn-events/burn-events.service.ts");
    const { BURN_EVENTS_ERROR } = await import("../../server/modules/burn-events/burn-events.errors.ts");
    const inventoryService = await import("../../server/modules/inventory/inventory.service.ts");

    assert.equal(DEFAULT_BURN_PROCESS_DURATION_SECONDS, 15 * 60);
    assert.equal(BURN_PROCESS_DURATION_ENV_KEY, "BURN_PROCESS_DURATION_SECONDS");
    assert.equal(readBurnProcessDurationSeconds(), SMOKE_BURN_DURATION_SECONDS);

    const requiredHashRate = 100;
    const reward = await prisma.miner.create({
      data: {
        name: `NeonForge Smoke ${tag.slice(-6)}`,
        slug: `smoke-burn-reward-${Date.now()}`,
        baseHashRate: 110,
        price: 0,
        slotSize: 1,
        showInShop: false,
        sourceType: "event",
      },
      select: { id: true, name: true, baseHashRate: true },
    });
    rewardMinerId = reward.id;

    await prisma.$transaction(async (tx) => {
      await inventoryService.grantPurchasedInventoryItems(
        tx,
        userId,
        {
          minerId: null,
          minerName: "Smoke GPU 50",
          hashRate: 50,
          slotSize: 1,
          imageUrl: null,
        },
        2,
        new Date(),
      );
    });

    const inventoryRows = await prisma.userOwnedMachine.findMany({
      where: { userId, location: "INVENTORY" },
      select: { id: true, hashRate: true },
      orderBy: { id: "asc" },
    });
    assert.equal(inventoryRows.length, 2);
    burnMachineIds = inventoryRows.map((r) => r.id);

    // Rack machine must NOT be burnable / claimable.
    const rackOm = await prisma.userOwnedMachine.create({
      data: {
        userId,
        location: "RACK",
        minerName: "Smoke Rack Only",
        hashRate: 500,
        slotSize: 1,
        level: 1,
      },
      select: { id: true },
    });
    rackMachineId = rackOm.id;

    const burnable = await burnService.getUserBurnableMachines(userId);
    assert.ok(burnable.every((m) => m.location !== "RACK"));
    assert.ok(!burnable.some((m) => m.id === rackMachineId));

    const event = await burnService.adminCreateEvent({
      title: `Smoke Burn ${tag}`,
      requiredHashRate,
      rewardMinerId,
      claimLimitPerUser: 1,
      stockTotal: 5,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 86_400_000),
      isActive: true,
    });
    eventId = event.id;

    const started = await burnService.startBurnEvent(userId, eventId, burnMachineIds, "SHIB");
    assert.ok(started?.sessionId);
    assert.equal(started.burnDurationSeconds, SMOKE_BURN_DURATION_SECONDS);

    // Pin completes_at in the future so we can prove the gate even if start() was slow.
    await prisma.$executeRaw`
      UPDATE burn_sessions
      SET completes_at = NOW() + INTERVAL '2 minutes'
      WHERE id = ${started.sessionId} AND status = 'pending'
    `;

    await assert.rejects(
      () => burnService.claimBurnEvent(userId, eventId, started.sessionId),
      (err) => {
        assert.equal(err.code, BURN_EVENTS_ERROR.BURN_NOT_READY);
        return true;
      },
    );

    // Machines are destroyed on start (not only on claim).
    const stillOwned = await prisma.userOwnedMachine.count({
      where: { id: { in: burnMachineIds } },
    });
    assert.equal(stillOwned, 0, "burned inventory machines must be deleted on start");

    const inventoryLinks = await prisma.userInventory.count({
      where: { ownedMachineId: { in: burnMachineIds } },
    });
    assert.equal(inventoryLinks, 0, "inventory rows for burned machines must be deleted on start");

    const vaultLinks = await prisma.userVault.count({
      where: { ownedMachineId: { in: burnMachineIds } },
    });
    assert.equal(vaultLinks, 0, "vault rows for burned machines must be deleted on start");

    const minerLinks = await prisma.userMiner.count({
      where: { ownedMachineId: { in: burnMachineIds } },
    });
    assert.equal(minerLinks, 0, "user_miner rows for burned machines must be deleted on start");

    // Simulate "15 min passed / burn ready" without sleeping the product default.
    await prisma.$executeRaw`
      UPDATE burn_sessions
      SET completes_at = NOW() - INTERVAL '1 second'
      WHERE id = ${started.sessionId} AND status = 'pending'
    `;

    const claimed = await burnService.claimBurnEvent(userId, eventId, started.sessionId);
    assert.equal(claimed.ok, true);
    assert.ok(claimed.rewardInboxId);

    const burnedGone = await prisma.userOwnedMachine.count({
      where: { id: { in: burnMachineIds } },
    });
    assert.equal(burnedGone, 0, "burned inventory machines stay deleted after claim");

    const rackStillThere = await prisma.userOwnedMachine.findUnique({
      where: { id: rackMachineId },
      select: { id: true, location: true },
    });
    assert.ok(rackStillThere, "rack machine must remain (not burnable)");
    assert.equal(rackStillThere.location, "RACK");

    const inbox = await prisma.userRewardInbox.findMany({
      where: { userId, source: "burn_event", status: "pending" },
    });
    assert.equal(inbox.length, 1, "reward must land as a single pending inbox row");
    assert.equal(inbox[0].rewardType, "machine");
    assert.equal(inbox[0].minerId, rewardMinerId);
    assert.equal(inbox[0].minerName, reward.name);
    assert.equal(Number(inbox[0].rewardValue), Number(reward.baseHashRate));

    const rewardOwned = await prisma.userOwnedMachine.count({
      where: { userId, minerId: rewardMinerId },
    });
    assert.equal(rewardOwned, 0, "reward must NOT go straight to inventory/owned machines");

    const inventoryAfter = await prisma.userInventory.count({
      where: { userId, minerId: rewardMinerId },
    });
    assert.equal(inventoryAfter, 0, "reward must NOT appear in inventory until collected");

    const feeDebited = await prisma.user.findUnique({
      where: { id: userId },
      select: { shibBalance: true },
    });
    assert.ok(feeDebited);
    assert.equal(Number(feeDebited.shibBalance), 100 - BURN_FEE_RATES.SHIB);
  });
});
