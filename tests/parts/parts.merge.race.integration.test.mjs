/**
 * Regression for the merge double-spend: the merge reads the 2 input machines, then
 * deletes them. If another transaction (burn claim, vault, room) removes the same
 * machines in between, the merge must abort and roll back parts, fee and the new
 * machine instead of minting an upgraded machine out of machines that are gone.
 */
import test from "node:test";
import assert from "node:assert/strict";

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { mergeMachineForUser } = await import("../../server/modules/parts/parts.merge.service.ts");
const { MERGE_OWNED_CATALOG_WHERE } = await import("../../server/modules/parts/parts.merge.ts");
const { PARTS_ERROR_CODE } = await import("../../server/modules/parts/parts.errors.ts");
const { getTierForLevel } = await import("../../server/modules/parts/parts.merge-tiers.ts");

const STARTING_BLK = "1000";
const COMPETING_TX_HOLD_MS = 2000;
const MERGE_START_DELAY_MS = 300;
const createdUserIds = [];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findMergeableMiner() {
  return prisma.miner.findFirst({ where: MERGE_OWNED_CATALOG_WHERE, orderBy: { id: "asc" } });
}

async function makeMergeReadyUser(miner) {
  const suffix = `pmr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      name: "Parts Merge Race User",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "127.0.0.1",
      ip: "127.0.0.1",
      userAgent: "test-runner/1.0",
      blkBalance: STARTING_BLK,
    },
  });
  createdUserIds.push(user.id);

  const machines = [];
  for (let i = 0; i < 2; i++) {
    machines.push(
      await prisma.userOwnedMachine.create({
        data: {
          userId: user.id,
          location: "INVENTORY",
          minerId: miner.id,
          minerName: miner.name,
          level: 1,
          hashRate: Number(miner.baseHashRate || 10),
          slotSize: 1,
        },
      }),
    );
  }
  const requirements = getTierForLevel(2).partsRequired;
  for (const req of requirements) {
    await prisma.userPartStack.create({
      data: { userId: user.id, partSlug: req.slug, rarity: req.rarity, quantity: req.required },
    });
  }
  return { user, machines, requirements };
}

async function snapshot(userId) {
  const [owned, parts, user, fees] = await Promise.all([
    prisma.userOwnedMachine.findMany({ where: { userId }, select: { id: true, level: true } }),
    prisma.userPartStack.findMany({ where: { userId }, select: { partSlug: true, rarity: true, quantity: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { blkBalance: true } }),
    prisma.transaction.count({ where: { userId, type: "merge_fee" } }),
  ]);
  return { owned, parts, blk: user.blkBalance.toString(), fees };
}

test.after(async () => {
  for (const id of createdUserIds) {
    await prisma.userInventory.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.userOwnedMachine.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.userPartStack.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.transaction.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
});

test("merge — happy path consumes 2 machines, parts and fee, and grants one level-2 machine", async (t) => {
  const miner = await findMergeableMiner();
  if (!miner) return t.skip("no mergeable catalog miner in the test database");
  const { user, machines } = await makeMergeReadyUser(miner);

  const result = await mergeMachineForUser(user.id, miner.id, undefined, "catalog", 1, "BLK");
  assert.equal(result.level, 2);

  const after = await snapshot(user.id);
  assert.equal(after.owned.length, 1);
  assert.equal(after.owned[0].level, 2);
  assert.ok(!after.owned.some((m) => machines.some((old) => old.id === m.id)));
  assert.ok(after.parts.every((p) => p.quantity === 0));
  assert.equal(after.fees, 1);
  assert.ok(Number(after.blk) < Number(STARTING_BLK));
});

test("merge — machines removed by a concurrent transaction abort the merge with no side effects", async (t) => {
  const miner = await findMergeableMiner();
  if (!miner) return t.skip("no mergeable catalog miner in the test database");
  const { user, machines, requirements } = await makeMergeReadyUser(miner);
  const machineIds = machines.map((m) => m.id);

  // Stands in for a burn claim: removes the same 2 machines and commits while the merge runs.
  const competing = prisma.$transaction(
    async (tx) => {
      const removed = await tx.userOwnedMachine.deleteMany({ where: { id: { in: machineIds } } });
      await sleep(COMPETING_TX_HOLD_MS);
      return removed.count;
    },
    { timeout: COMPETING_TX_HOLD_MS * 5 },
  );
  await sleep(MERGE_START_DELAY_MS);
  const merge = mergeMachineForUser(user.id, miner.id, undefined, "catalog", 1, "BLK").then(
    () => ({ ok: true }),
    (error) => ({ ok: false, code: error.code, http: error.status ?? error.statusCode ?? error.http }),
  );

  const [removedByOther, mergeOutcome] = await Promise.all([competing, merge]);
  assert.equal(removedByOther, 2, "the competing transaction owns the removal of both machines");
  assert.equal(mergeOutcome.ok, false, "merge must not succeed over machines that are gone");
  assert.equal(mergeOutcome.code, PARTS_ERROR_CODE.MACHINES_CHANGED);

  const after = await snapshot(user.id);
  assert.deepEqual(after.owned, [], "no upgraded machine may be minted");
  for (const req of requirements) {
    const stack = after.parts.find((p) => p.partSlug === req.slug && p.rarity === req.rarity);
    assert.equal(stack?.quantity, req.required, `parts ${req.slug} must be rolled back`);
  }
  assert.equal(Number(after.blk), Number(STARTING_BLK), "fee must be rolled back");
  assert.equal(after.fees, 0, "no merge_fee transaction may remain");
});
