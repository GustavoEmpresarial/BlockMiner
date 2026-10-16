/**
 * Activity part drop writes a real common stack and ignores a repeated sourceRef.
 * Requires DATABASE_URL.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

test("activity part drop persists one common part per sourceRef", { skip: !process.env.DATABASE_URL && "DATABASE_URL not set" }, async () => {
  const prisma = (await import("../../server/core/database/prisma.ts")).default;
  const { grantActivityPartInTx, partDropPayload } = await import("../../server/modules/parts/parts.grant.ts");
  const { PART_GRANT_SOURCE } = await import("../../server/modules/parts/parts.drop.ts");

  const stamp = `${Date.now()}_${crypto.randomInt(1000, 9999)}`;
  const user = await prisma.user.create({
    data: {
      name: "Activity drop smoke",
      email: `parts_drop_${stamp}@blockminer.test`,
      username: `pdrop_${stamp}`.slice(0, 30),
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
      blkBalance: 0,
    },
  });

  try {
    const sourceRef = `faucet:${user.id}:1`;
    const first = await prisma.$transaction((tx) => grantActivityPartInTx(tx, {
      userId: user.id,
      source: PART_GRANT_SOURCE.faucet,
      sourceRef,
      baseBps: 10_000,
    }));
    const replay = await prisma.$transaction((tx) => grantActivityPartInTx(tx, {
      userId: user.id,
      source: PART_GRANT_SOURCE.faucet,
      sourceRef,
      baseBps: 10_000,
    }));
    const miss = await prisma.$transaction((tx) => grantActivityPartInTx(tx, {
      userId: user.id,
      source: PART_GRANT_SOURCE.youtube,
      sourceRef: `youtube:${user.id}:miss`,
      baseBps: 0,
    }));

    assert.equal(first.granted, true);
    assert.equal(first.rarity, "common");
    assert.equal(first.quantity, 1);
    assert.equal(replay.granted, false);
    assert.equal(partDropPayload(replay), null);
    assert.equal(miss.granted, false);

    const stacks = await prisma.userPartStack.findMany({ where: { userId: user.id } });
    assert.equal(stacks.length, 1);
    assert.equal(stacks[0].partSlug, first.partSlug);
    assert.equal(stacks[0].rarity, "common");
    assert.equal(stacks[0].quantity, 1);

    const grants = await prisma.partGrant.findMany({ where: { userId: user.id } });
    assert.equal(grants.length, 1);
    assert.equal(grants[0].source, PART_GRANT_SOURCE.faucet);
    assert.equal(grants[0].sourceRef, sourceRef);
  } finally {
    await prisma.partGrant.deleteMany({ where: { userId: user.id } });
    await prisma.userPartStack.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
