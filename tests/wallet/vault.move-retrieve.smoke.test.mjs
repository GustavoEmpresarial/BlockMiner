/**
 * Smoke: inventory → vault → inventory side effects on the service (no Express/CSRF).
 * Requires DATABASE_URL. Skips otherwise.
 */
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

const hasDb = Boolean(String(process.env.DATABASE_URL || "").trim());

test("moveToVaultForUser then retrieveFromVaultForUser: inventory ↔ vault + owned-machine location", {
  skip: !hasDb && "DATABASE_URL not set",
}, async (t) => {
  let prisma;
  try {
    prisma = (await import("../../server/core/database/prisma.ts")).default;
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    t.skip(`Prisma unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const vaultService = await import("../../server/modules/wallet/vault/vault.service.ts");
  const createdUserIds = [];

  t.after(async () => {
    for (const userId of createdUserIds) {
      await prisma.userVault.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userInventory.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.userOwnedMachine.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.notification.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  const tag = `vault-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({
    data: { name: tag, email: `${tag}@blockminer.test`, passwordHash: "x" },
    select: { id: true },
  });
  createdUserIds.push(user.id);

  const catalog = await prisma.miner.findFirst({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { id: true, name: true, imageUrl: true, baseHashRate: true, slotSize: true },
  });

  const inventory = await prisma.userInventory.create({
    data: {
      userId: user.id,
      minerId: catalog?.id ?? null,
      minerName: catalog?.name ?? "Welcome Miner",
      level: 1,
      hashRate: catalog?.baseHashRate ?? 100,
      slotSize: catalog?.slotSize ?? 1,
      imageUrl: catalog?.imageUrl ?? null,
    },
  });

  const moved = await vaultService.moveToVaultForUser(user.id, { source: "inventory", itemId: inventory.id });
  assert.equal(moved.movedCount, 1);

  const afterMoveInv = await prisma.userInventory.findUnique({ where: { id: inventory.id } });
  assert.equal(afterMoveInv, null, "inventory row must disappear after move");

  const vaultRows = await prisma.userVault.findMany({ where: { userId: user.id } });
  assert.equal(vaultRows.length, 1);
  const vaultId = vaultRows[0].id;
  assert.ok(vaultRows[0].ownedMachineId, "vault row must carry an owned machine");

  const omAfterMove = await prisma.userOwnedMachine.findUniqueOrThrow({
    where: { id: vaultRows[0].ownedMachineId },
  });
  assert.equal(omAfterMove.location, "WAREHOUSE");

  const retrieved = await vaultService.retrieveFromVaultForUser(user.id, {
    destination: "inventory",
    vaultId,
  });
  assert.equal(retrieved.movedCount, 1);

  const afterRetrieveVault = await prisma.userVault.findUnique({ where: { id: vaultId } });
  assert.equal(afterRetrieveVault, null, "vault row must disappear after retrieve");

  const invBack = await prisma.userInventory.findMany({ where: { userId: user.id } });
  assert.equal(invBack.length, 1);
  assert.equal(invBack[0].ownedMachineId, omAfterMove.id);

  const omAfterRetrieve = await prisma.userOwnedMachine.findUniqueOrThrow({ where: { id: omAfterMove.id } });
  assert.equal(omAfterRetrieve.location, "INVENTORY");
});
