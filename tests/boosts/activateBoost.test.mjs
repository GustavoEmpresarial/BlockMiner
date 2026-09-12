/**
 * activateBoost — the money-moving path (balance check, debit, per-day unique
 * constraint, audit log). Previously untested: every existing boosts test only
 * covered the pure TTL/reward-duration math via injected `tx` parameters.
 * activateBoost itself opens its own `prisma.$transaction`, so it takes an
 * injectable Prisma-like `client` (see boosts.service.ts) so these tests run
 * against a fake client instead of needing a live DB.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { activateBoost, BOOST_COST_POL } from "../../server/modules/boosts/boosts.service.ts";

/** Builds a fake Prisma client whose $transaction only "commits" writes if the
 *  callback resolves without throwing — mirrors real transaction rollback
 *  semantics closely enough to test activateBoost's control flow honestly. */
function fakeClient({ existingBoost = null, balances, createBoostThrows = null }) {
  const state = { ...balances };
  const auditLogs = [];
  const createdBoosts = [];
  return {
    state,
    auditLogs,
    createdBoosts,
    async $transaction(fn) {
      const pendingWrites = [];
      const tx = {
        dailyPowerBoost: {
          findUnique: async () => existingBoost,
          create: async ({ data }) => {
            if (createBoostThrows) throw createBoostThrows;
            pendingWrites.push(() => createdBoosts.push(data));
            return { id: createdBoosts.length + 1, ...data };
          },
        },
        user: {
          findUnique: async () => ({ polBalance: state.POL, blkBalance: state.BLK, shibBalance: state.SHIB }),
          update: async ({ data }) => {
            const field = Object.keys(data)[0];
            const currency = field === "polBalance" ? "POL" : field === "blkBalance" ? "BLK" : "SHIB";
            const dec = data[field].decrement;
            pendingWrites.push(() => {
              state[currency] = state[currency] - dec;
            });
            const next = { ...state, [currency]: state[currency] - dec };
            return { polBalance: next.POL, blkBalance: next.BLK, shibBalance: next.SHIB };
          },
        },
        auditLog: {
          create: async ({ data }) => {
            pendingWrites.push(() => auditLogs.push(data));
          },
        },
      };
      const result = await fn(tx); // throws propagate to caller, no pendingWrites applied
      for (const w of pendingWrites) w();
      return result;
    },
  };
}

test("activateBoost: succeeds in POL, debits exactly BOOST_COST_POL, creates the boost row and an audit log", async () => {
  const client = fakeClient({ balances: { POL: 1, BLK: 0, SHIB: 0 } });
  const result = await activateBoost(1, "POL", client);

  assert.equal(result.ok, true);
  assert.equal(result.currency, "POL");
  assert.equal(result.feePaid, BOOST_COST_POL);
  assert.equal(client.state.POL, 1 - BOOST_COST_POL, "balance must be debited by exactly the fee");
  assert.equal(client.createdBoosts.length, 1, "exactly one boost row created — no double-write");
  assert.equal(client.auditLogs.length, 1, "activation must be audit-logged");
  assert.ok(result.entitlementExpiresAt, "must report when the entitlement expires");
});

test("activateBoost: rejects with INSUFFICIENT_BALANCE and touches no balance/boost row when funds are short", async () => {
  const client = fakeClient({ balances: { POL: 0.001, BLK: 0, SHIB: 0 } }); // less than BOOST_COST_POL
  const result = await activateBoost(1, "POL", client);

  assert.equal(result.ok, false);
  assert.equal(result.code, "INSUFFICIENT_BALANCE");
  assert.equal(client.state.POL, 0.001, "balance must be untouched on a rejected activation");
  assert.equal(client.createdBoosts.length, 0);
  assert.equal(client.auditLogs.length, 0);
});

test("activateBoost: rejects with ALREADY_ACTIVE and debits nothing when a boost already exists for today", async () => {
  const client = fakeClient({ existingBoost: { id: 5 }, balances: { POL: 10, BLK: 0, SHIB: 0 } });
  const result = await activateBoost(1, "POL", client);

  assert.equal(result.ok, false);
  assert.equal(result.code, "ALREADY_ACTIVE");
  assert.equal(client.state.POL, 10, "must never debit when already active — this is the double-spend guard");
  assert.equal(client.createdBoosts.length, 0);
});

test("activateBoost: a concurrent-activation race (unique constraint violation) is caught and reported as ALREADY_ACTIVE, with no balance left debited", async () => {
  // Simulates two requests both passing the `existing` check (race window) before
  // either commits — the DB's real @@unique([userId, dayKey]) throws P2002 on the
  // second writer's INSERT. The transaction must roll back the debit that already
  // ran earlier in the same callback (modeled here by pendingWrites never applying).
  const p2002 = Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    name: "PrismaClientKnownRequestError",
  });
  // Real Prisma errors are instances of Prisma.PrismaClientKnownRequestError; the
  // service's isUniqueViolation() checks `instanceof`, so simulate that shape by
  // importing the real class and using it directly.
  const { Prisma } = await import("@prisma/client");
  const realError = Object.create(Prisma.PrismaClientKnownRequestError.prototype);
  Object.assign(realError, { code: "P2002", message: "Unique constraint failed", clientVersion: "test" });

  const client = fakeClient({ balances: { POL: 10, BLK: 0, SHIB: 0 }, createBoostThrows: realError });
  const result = await activateBoost(1, "POL", client);

  assert.equal(result.ok, false);
  assert.equal(result.code, "ALREADY_ACTIVE");
  assert.equal(client.state.POL, 10, "the debit from the losing racer must roll back, not stick");
  assert.equal(client.createdBoosts.length, 0);
  assert.equal(client.auditLogs.length, 0);
});

test("activateBoost: a non-unique-violation database error propagates instead of being swallowed as ALREADY_ACTIVE", async () => {
  const client = fakeClient({ balances: { POL: 10, BLK: 0, SHIB: 0 }, createBoostThrows: new Error("connection reset") });
  await assert.rejects(() => activateBoost(1, "POL", client), /connection reset/);
});
