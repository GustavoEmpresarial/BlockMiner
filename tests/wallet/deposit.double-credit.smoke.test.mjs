/**
 * Smoke: same on-chain txHash must not credit polBalance twice.
 * Requires DATABASE_URL (skipped otherwise).
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";

const hasDb = Boolean(process.env.DATABASE_URL?.trim());

function fakeTxHash() {
  return `0x${randomBytes(32).toString("hex")}`;
}

test(
  "creditVerifiedDeposit is idempotent and blocks duplicate txHash credit",
  { skip: !hasDb },
  async () => {
    const { default: prisma } = await import("../../server/core/database/prisma.ts");
    const { creditVerifiedDeposit } = await import(
      "../../server/modules/wallet/deposit/deposit.repository.ts"
    );

    const email = `deposit-dup-${Date.now()}@test.local`;
    const username = `dep_dup_${Date.now().toString(36)}`;
    const passwordHash = createHash("sha256").update("x").digest("hex");
    const txHash = fakeTxHash();
    const eventAt = new Date();

    const snapshot = await prisma.assetPriceSnapshot.create({
      data: {
        asset: "POL",
        eventAt,
        priceUsd: 0.1,
        source: "test",
      },
    });

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        polBalance: 0,
      },
      select: { id: true },
    });

    const pendingA = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "deposit",
        amount: "0",
        txHash,
        status: "pending_verification",
        verifyAttempts: 0,
      },
    });
    const pendingB = await prisma.transaction.create({
      data: {
        userId: user.id,
        type: "deposit",
        amount: "0",
        txHash,
        status: "pending_verification",
        verifyAttempts: 0,
      },
    });

    const baseInput = {
      userId: user.id,
      verifiedAmountPol: 12.5,
      fromAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      attempts: 1,
      blockNumber: 1,
      source: "treasury",
      confirmedEventAt: eventAt,
      usdRate: 0.1,
      usdValue: 1.25,
      countsForTournament: false,
      priceSnapshotId: snapshot.id,
    };

    const first = await creditVerifiedDeposit({ ...baseInput, transactionId: pendingA.id });
    assert.ok(first);
    assert.equal(first.status, "completed");

    const second = await creditVerifiedDeposit({ ...baseInput, transactionId: pendingB.id });
    assert.equal(second, null);

    const again = await creditVerifiedDeposit({ ...baseInput, transactionId: pendingA.id });
    assert.ok(again);
    assert.equal(again.status, "completed");

    const refreshed = await prisma.user.findUnique({
      where: { id: user.id },
      select: { polBalance: true },
    });
    assert.equal(Number(refreshed?.polBalance), 12.5);

    const rows = await prisma.transaction.findMany({
      where: { userId: user.id, type: "deposit", txHash },
      orderBy: { id: "asc" },
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].status, "completed");
    assert.equal(rows[1].status, "failed");

    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.assetPriceSnapshot.delete({ where: { id: snapshot.id } }).catch(() => undefined);
  },
);
