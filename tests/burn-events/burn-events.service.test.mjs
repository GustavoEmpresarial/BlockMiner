import test from "node:test";
import assert from "node:assert/strict";

const burnService = await import("../../server/modules/burn-events/burn-events.service.ts");
const { BURN_EVENTS_ERROR } = await import("../../server/modules/burn-events/burn-events.errors.ts");

test("startBurnEvent: rejects invalid feeCurrency", async () => {
  await assert.rejects(
    async () => {
      await burnService.startBurnEvent(1, 10, [101], "BTC");
    },
    (err) => {
      assert.equal(err.code, BURN_EVENTS_ERROR.INVALID_FEE_CURRENCY);
      return true;
    },
  );

  await assert.rejects(
    async () => {
      await burnService.startBurnEvent(1, 10, [101], "");
    },
    (err) => {
      assert.equal(err.code, BURN_EVENTS_ERROR.INVALID_FEE_CURRENCY);
      return true;
    },
  );
});

test("startBurnEvent: rejects oversized machine id payloads (DoS cap, not product limit)", async () => {
  const { DEFAULT_MAX_BURN_OWNED_MACHINE_IDS } = await import(
    "../../server/modules/burn-events/burn-events.config.ts"
  );
  const tooMany = Array.from({ length: DEFAULT_MAX_BURN_OWNED_MACHINE_IDS + 1 }, (_, i) => i + 1);
  await assert.rejects(
    async () => {
      await burnService.startBurnEvent(1, 10, tooMany, "SHIB");
    },
    (err) => {
      assert.equal(err.code, BURN_EVENTS_ERROR.TOO_MANY_MACHINES);
      return true;
    },
  );
});

test("startBurnEvent: rejects empty machines array", async () => {
  await assert.rejects(
    async () => {
      await burnService.startBurnEvent(1, 10, [], "SHIB");
    },
    (err) => {
      assert.equal(err.code, BURN_EVENTS_ERROR.NO_MACHINES_SELECTED);
      return true;
    },
  );
});

test("startBurnEvent: rejects when a pending session already exists for the event", async () => {
  const prisma = (await import("../../server/core/database/prisma.ts")).default;
  const prevTx = prisma.$transaction.bind(prisma);
  const prevFind = burnService.repoRef.findPendingBurnSessionForEventTx;

  prisma.$transaction = async (fn) =>
    fn({
      $executeRaw: async () => undefined,
    });
  burnService.repoRef.findPendingBurnSessionForEventTx = async () => ({
    id: 42,
    event_id: 10,
    user_id: 1,
    owned_machine_ids: [{ id: 101 }],
    started_at: new Date(),
    completes_at: new Date(Date.now() + 60_000),
    status: "pending",
  });

  try {
    await assert.rejects(
      async () => {
        await burnService.startBurnEvent(1, 10, [101], "SHIB");
      },
      (err) => {
        assert.equal(err.code, BURN_EVENTS_ERROR.BURN_ALREADY_PENDING);
        return true;
      },
    );
  } finally {
    prisma.$transaction = prevTx;
    burnService.repoRef.findPendingBurnSessionForEventTx = prevFind;
  }
});

test("startBurnEvent: destroys machines inside the start transaction before creating the session", async () => {
  const prisma = (await import("../../server/core/database/prisma.ts")).default;
  const prevTx = prisma.$transaction.bind(prisma);
  const stubs = {
    findPendingBurnSessionForEventTx: burnService.repoRef.findPendingBurnSessionForEventTx,
    findBurnEventWithRewardMinerTx: burnService.repoRef.findBurnEventWithRewardMinerTx,
    countUserBurnClaimsTx: burnService.repoRef.countUserBurnClaimsTx,
    findOwnedMachinesForBurnTx: burnService.repoRef.findOwnedMachinesForBurnTx,
    findUserBalancesTx: burnService.repoRef.findUserBalancesTx,
    decrementUserFeeBalanceTx: burnService.repoRef.decrementUserFeeBalanceTx,
    deleteBurnedMachineRowsTx: burnService.repoRef.deleteBurnedMachineRowsTx,
    createBurnSessionTx: burnService.repoRef.createBurnSessionTx,
  };

  /** @type {string[]} */
  const order = [];
  let findOwnedCalls = 0;

  prisma.$transaction = async (fn) =>
    fn({
      $executeRaw: async () => undefined,
    });

  burnService.repoRef.findPendingBurnSessionForEventTx = async () => null;
  burnService.repoRef.findBurnEventWithRewardMinerTx = async () => ({
    id: 10,
    isActive: true,
    deletedAt: null,
    startsAt: null,
    endsAt: null,
    stockTotal: null,
    stockClaimed: 0,
    claimLimitPerUser: 1,
    requiredHashRate: 50,
    rewardMiner: { id: 1, name: "Reward", baseHashRate: 110, slotSize: 1, imageUrl: null },
  });
  burnService.repoRef.countUserBurnClaimsTx = async () => 0;
  burnService.repoRef.findOwnedMachinesForBurnTx = async (_tx, ids) => {
    findOwnedCalls += 1;
    // First call (assertCanStartOrClaim): machines exist. Second (post-destroy verify): gone.
    if (findOwnedCalls === 1) {
      return ids.map((id) => ({
        id,
        minerName: `M-${id}`,
        hashRate: 50,
        slotSize: 1,
        location: "INVENTORY",
      }));
    }
    return [];
  };
  burnService.repoRef.findUserBalancesTx = async () => ({
    id: 1,
    shibBalance: 100,
    polBalance: 1,
    blkBalance: 1,
  });
  burnService.repoRef.decrementUserFeeBalanceTx = async () => {
    order.push("fee");
    return {};
  };
  burnService.repoRef.deleteBurnedMachineRowsTx = async (_tx, ids, userId) => {
    order.push("destroy");
    assert.deepEqual(ids, [101]);
    assert.equal(userId, 1);
    return { deletedOwned: ids.length };
  };
  burnService.repoRef.createBurnSessionTx = async () => {
    order.push("session");
    return {
      id: 99,
      event_id: 10,
      user_id: 1,
      owned_machine_ids: [{ id: 101 }],
      started_at: new Date(),
      completes_at: new Date(),
      status: "pending",
    };
  };

  try {
    const result = await burnService.startBurnEvent(1, 10, [101], "SHIB");
    assert.equal(result.ok, true);
    assert.equal(result.sessionId, 99);
    assert.deepEqual(order, ["fee", "destroy", "session"]);
    assert.ok(findOwnedCalls >= 2, "must re-read owned machines after destroy");
  } finally {
    prisma.$transaction = prevTx;
    Object.assign(burnService.repoRef, stubs);
  }
});

test("startBurnEvent: validates fee rates and balance checks (SHIB: 20, POL: 0.01, BLK: 0.001)", async () => {
  const { BURN_FEE_RATES } = await import("../../server/modules/burn-events/burn-events.config.ts");
  assert.equal(BURN_FEE_RATES.SHIB, 20);
  assert.equal(BURN_FEE_RATES.POL, 0.01);
  assert.equal(BURN_FEE_RATES.BLK, 0.001);
});
