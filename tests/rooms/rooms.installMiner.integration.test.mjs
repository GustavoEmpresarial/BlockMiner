/**
 * Real integration test against a live database for the actual, currently-used
 * install/uninstall flow behind /inventory (`rooms.service.ts`'s
 * `installMinerForUser` / `uninstallMinerForUser` / `uninstallMinerBatchForUser`,
 * wired to POST /rooms/rack/install|uninstall|uninstall-batch — the endpoints the
 * client's Inventory2Page actually calls). This is the money-adjacent state
 * transition the inventory-cleanup pass singled out as untested: installing a
 * machine debits nothing directly, but it does move real UserInventory/UserRack/
 * UserMiner rows that the mining engine reads for hashrate, so a bug here either
 * loses a paid-for machine or grants free, unlimited rack capacity.
 *
 * Requires DATABASE_URL to point at a real Postgres (dev/staging — never
 * production). Skips itself gracefully otherwise. Creates disposable users and
 * always cleans them up in `after`, even on failure.
 */
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("rooms install/uninstall — live DB integration (the real /inventory flow)", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  let prisma;
  let roomsService;
  const createdUserIds = [];

  before(async () => {
    prisma = (await import("../../server/core/database/prisma.ts")).default;
    roomsService = await import("../../server/modules/rooms/rooms.service.ts");
  });

  after(async () => {
    for (const userId of createdUserIds) {
      await prisma.userRack.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userMiner.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userInventory.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userOwnedMachine.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userRoom.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  async function makeUserWithStarterRoom() {
    const tag = `integration-test-rooms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: { name: tag, email: `${tag}@blockminer.test`, passwordHash: "x", polBalance: 0 },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    await prisma.$transaction(async (tx) => {
      await roomsService.provisionFirstRoomTx(tx, user.id);
    });
    return user.id;
  }

  async function makeInventoryItem(userId, overrides = {}) {
    const item = await prisma.userInventory.create({
      data: {
        userId,
        minerName: "Test Miner",
        level: 1,
        hashRate: 100,
        slotSize: 1,
        imageUrl: null,
        ...overrides,
      },
    });
    return item.id;
  }

  async function firstFreeRack(userId) {
    return prisma.userRack.findFirst({ where: { userId, userMinerId: null }, orderBy: { position: "asc" } });
  }

  test("installs a 1-slot machine: creates a UserMiner, links UserRack, removes the UserInventory row", async () => {
    const userId = await makeUserWithStarterRoom();
    const inventoryId = await makeInventoryItem(userId);
    const rack = await firstFreeRack(userId);

    const result = await roomsService.installMinerForUser(userId, rack.id, inventoryId);
    assert.equal(result.inventoryItem.minerName, "Test Miner");

    const updatedRack = await prisma.userRack.findUnique({ where: { id: rack.id } });
    assert.ok(updatedRack.userMinerId, "the rack must now point at a real UserMiner row");

    const miner = await prisma.userMiner.findUnique({ where: { id: updatedRack.userMinerId } });
    assert.ok(miner, "installed machine must exist as a UserMiner row");
    assert.equal(miner.hashRate, 100);

    const stillInInventory = await prisma.userInventory.findUnique({ where: { id: inventoryId } });
    assert.equal(stillInInventory, null, "the inventory row must be consumed on install");
  });

  test("rejects installing into an already-occupied rack with RACK_OCCUPIED", async () => {
    // installMinerForUser resolves failures as a plain {status, code, message} object
    // rather than throwing — the controller's separate preflightInstallMiner() call is
    // what actually throws/short-circuits in the real HTTP path. Assert on the return
    // shape, not on a rejection.
    const userId = await makeUserWithStarterRoom();
    const rack = await firstFreeRack(userId);
    await roomsService.installMinerForUser(userId, rack.id, await makeInventoryItem(userId));

    const secondInventoryId = await makeInventoryItem(userId);
    const result = await roomsService.installMinerForUser(userId, rack.id, secondInventoryId);
    assert.equal(result.status, 400);
    assert.equal(result.code, "RACK_OCCUPIED");

    // The second item must still be sitting untouched in inventory — no partial mutation.
    const stillThere = await prisma.userInventory.findUnique({ where: { id: secondInventoryId } });
    assert.ok(stillThere, "a rejected install must not consume the inventory item");
  });

  test("IDOR: cannot install into another user's rack, and cannot install another user's inventory item", async () => {
    const ownerId = await makeUserWithStarterRoom();
    const attackerId = await makeUserWithStarterRoom();
    const ownerRack = await firstFreeRack(ownerId);
    const attackerInventoryId = await makeInventoryItem(attackerId);

    // Attacker tries to install their own item into the owner's rack.
    const attackResult = await roomsService.installMinerForUser(attackerId, ownerRack.id, attackerInventoryId);
    assert.equal(attackResult.status, 404, "a rack scoped to another user must read as not-found, not leak occupancy state");

    // Owner tries to install the attacker's inventory item into their own rack.
    const crossItemResult = await roomsService.installMinerForUser(ownerId, ownerRack.id, attackerInventoryId);
    assert.equal(crossItemResult.status, 404);

    // Nothing should have moved for either user.
    const attackerItemStillThere = await prisma.userInventory.findUnique({ where: { id: attackerInventoryId } });
    assert.ok(attackerItemStillThere);
    const ownerRackStillFree = await prisma.userRack.findUnique({ where: { id: ownerRack.id } });
    assert.equal(ownerRackStillFree.userMinerId, null);
  });

  test("uninstalling returns the machine to inventory and frees the rack", async () => {
    const userId = await makeUserWithStarterRoom();
    const rack = await firstFreeRack(userId);
    await roomsService.installMinerForUser(userId, rack.id, await makeInventoryItem(userId, { minerName: "Round Trip" }));

    await roomsService.uninstallMinerForUser(userId, rack.id);

    const freedRack = await prisma.userRack.findUnique({ where: { id: rack.id } });
    assert.equal(freedRack.userMinerId, null, "rack must be freed");

    const backInInventory = await prisma.userInventory.findFirst({ where: { userId, minerName: "Round Trip" } });
    assert.ok(backInInventory, "the machine must reappear in inventory after uninstall");
  });

  test("rejects uninstalling an empty rack with RACK_EMPTY", async () => {
    const userId = await makeUserWithStarterRoom();
    const rack = await firstFreeRack(userId);
    await assert.rejects(
      () => roomsService.uninstallMinerForUser(userId, rack.id),
      (err) => {
        assert.equal(err.code, "RACK_EMPTY");
        return true;
      },
    );
  });

  test("batch-uninstall is all-or-nothing: if one rack in the batch is empty, none are uninstalled", async () => {
    const userId = await makeUserWithStarterRoom();
    const racks = await prisma.userRack.findMany({ where: { userId, userMinerId: null }, orderBy: { position: "asc" }, take: 2 });
    const [occupiedRack, emptyRack] = racks;
    await roomsService.installMinerForUser(userId, occupiedRack.id, await makeInventoryItem(userId));

    await assert.rejects(() => roomsService.uninstallMinerBatchForUser(userId, [occupiedRack.id, emptyRack.id]));

    const stillOccupied = await prisma.userRack.findUnique({ where: { id: occupiedRack.id } });
    assert.ok(stillOccupied.userMinerId, "the occupied rack must NOT be uninstalled when the batch partially fails");
  });

  test("two concurrent installs into the same rack: exactly one succeeds, no double-install", async () => {
    // installMinerForUser resolves business-rule failures as a plain object rather than
    // throwing (see the RACK_OCCUPIED test above) — both promises fulfill either way, so
    // the race must be judged by each result's *shape*, not by fulfilled-vs-rejected.
    const userId = await makeUserWithStarterRoom();
    const rack = await firstFreeRack(userId);
    const itemA = await makeInventoryItem(userId);
    const itemB = await makeInventoryItem(userId);

    const [resultA, resultB] = await Promise.all([
      roomsService.installMinerForUser(userId, rack.id, itemA),
      roomsService.installMinerForUser(userId, rack.id, itemB),
    ]);

    const succeeded = [resultA, resultB].filter((r) => "inventoryItem" in r);
    const rejected = [resultA, resultB].filter((r) => "status" in r);
    assert.equal(succeeded.length, 1, "exactly one concurrent install into the same rack must win");
    assert.equal(rejected.length, 1);
    // The preflight read-then-write window means the loser can lose either to the
    // pre-transaction occupancy check (RACK_OCCUPIED) or to the DB's unique constraint
    // inside the transaction (RACE_CONDITION_DETECTED, added by this pass — see
    // rooms.service.ts's installMinerForUser) depending on how the race lands. Both are
    // the correct, non-corrupting outcome; either is acceptable here.
    assert.ok(
      ["RACK_OCCUPIED", "RACE_CONDITION_DETECTED"].includes(rejected[0].code),
      `unexpected failure code: ${rejected[0].code}`,
    );

    const finalRack = await prisma.userRack.findUnique({ where: { id: rack.id } });
    assert.ok(finalRack.userMinerId, "the rack must end up installed exactly once");

    const remainingInventory = await prisma.userInventory.count({ where: { userId } });
    assert.equal(remainingInventory, 1, "exactly one of the two items must remain in inventory (the loser)");

    const allMiners = await prisma.userMiner.findMany({ where: { userId } });
    assert.equal(allMiners.length, 1, "no orphaned UserMiner row from a lost race");
  });
});
