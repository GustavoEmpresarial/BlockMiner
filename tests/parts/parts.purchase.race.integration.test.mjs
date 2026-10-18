/**
 * Regression for the part-purchase double spend: the advisory lock is keyed per
 * (user, part), so two purchases of DIFFERENT parts by the same user ran in parallel,
 * both read the same balance and both decremented it into the negative.
 */
import test from "node:test";
import assert from "node:assert/strict";

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { purchasePartForUser, purchasePartPackForUser, PART_OFFER_PRICES, PART_OFFER_PACKS } = await import(
  "../../server/modules/parts/parts.pricing.ts"
);

const createdUserIds = [];

async function makeUser(blkBalance) {
  const suffix = `ppr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: {
      name: "Parts Purchase Race User",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "127.0.0.1",
      ip: "127.0.0.1",
      userAgent: "test-runner/1.0",
      blkBalance,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function snapshot(userId) {
  const [user, stacks, ledger] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { blkBalance: true } }),
    prisma.userPartStack.findMany({ where: { userId }, select: { partSlug: true, rarity: true, quantity: true } }),
    prisma.transaction.findMany({ where: { userId }, select: { type: true, amount: true } }),
  ]);
  return { blk: Number(user.blkBalance), stacks, ledger };
}

const settle = (p) => p.then(() => ({ ok: true }), (error) => ({ ok: false, code: error.code }));

test.after(async () => {
  for (const id of createdUserIds) {
    await prisma.userPartStack.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.transaction.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
});

test("part purchase — concurrent buys of different parts never overdraw the balance", async () => {
  // Enough for exactly one legendary at the offer price.
  const user = await makeUser(String(PART_OFFER_PRICES.legendary));
  const slugs = ["power_cable", "asic_chip", "cooling_fan", "hashboard", "power_supply", "thermal_pad"];

  const outcomes = await Promise.all(
    slugs.map((slug) =>
      settle(purchasePartForUser({ userId: user.id, slug, rarity: "legendary", quantity: 1, channel: "offer" })),
    ),
  );

  const after = await snapshot(user.id);
  assert.ok(after.blk >= 0, `balance went negative: ${after.blk}`);
  assert.equal(outcomes.filter((o) => o.ok).length, 1, "only one purchase fits the balance");
  assert.ok(outcomes.filter((o) => !o.ok).every((o) => o.code === "INSUFFICIENT_BALANCE"));
  assert.equal(after.stacks.reduce((sum, s) => sum + s.quantity, 0), 1, "only one part may be granted");
});

test("part purchase — writes one ledger row with the amount charged", async () => {
  const user = await makeUser("1");
  await purchasePartForUser({ userId: user.id, slug: "asic_chip", rarity: "rare", quantity: 3, channel: "offer" });

  const after = await snapshot(user.id);
  assert.equal(after.ledger.length, 1);
  assert.equal(after.ledger[0].type, "part_purchase");
  assert.equal(Number(after.ledger[0].amount), Math.round(PART_OFFER_PRICES.rare * 3 * 1e8) / 1e8);
  assert.equal(after.blk, Math.round((1 - PART_OFFER_PRICES.rare * 3) * 1e8) / 1e8);
});

test("part pack — concurrent pack and single buy never overdraw the balance", async () => {
  const pack = PART_OFFER_PACKS[0];
  const user = await makeUser(String(pack.price));

  const outcomes = await Promise.all([
    settle(purchasePartPackForUser(user.id, pack.id)),
    settle(purchasePartForUser({ userId: user.id, slug: "hashboard", rarity: "rare", quantity: 1, channel: "offer" })),
  ]);

  const after = await snapshot(user.id);
  assert.ok(after.blk >= 0, `balance went negative: ${after.blk}`);
  assert.equal(outcomes.filter((o) => o.ok).length, 1, "only one purchase fits the balance");
  assert.equal(after.ledger.length, 1, "exactly one ledger row for the purchase that went through");
});

test("part purchase — insufficient balance changes nothing", async () => {
  const user = await makeUser("0.0001");
  const outcome = await settle(
    purchasePartForUser({ userId: user.id, slug: "asic_chip", rarity: "epic", quantity: 1, channel: "offer" }),
  );
  assert.deepEqual(outcome, { ok: false, code: "INSUFFICIENT_BALANCE" });
  const after = await snapshot(user.id);
  assert.equal(after.blk, 0.0001);
  assert.deepEqual(after.stacks, []);
  assert.deepEqual(after.ledger, []);
});
