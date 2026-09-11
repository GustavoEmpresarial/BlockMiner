import test from "node:test";
import assert from "node:assert/strict";

const { applyAnonymousSessionEviction } = await import("../../server/modules/auth/login/login.anonymous-evict.ts");

test("applyAnonymousSessionEviction: bumps sessionVersion, revokes refresh, invalidates cache", async () => {
  const calls = [];
  const prisma = {
    user: {
      update: async (args) => {
        calls.push(["user.update", args]);
        return { id: args.where.id };
      },
    },
    refreshToken: {
      updateMany: async (args) => {
        calls.push(["refreshToken.updateMany", args]);
        return { count: 1 };
      },
    },
  };
  await applyAnonymousSessionEviction(prisma, 294);
  assert.equal(calls[0][0], "user.update");
  assert.equal(calls[0][1].where.id, 294);
  assert.deepEqual(calls[0][1].data.sessionVersion, { increment: 1 });
  assert.equal(calls[1][0], "refreshToken.updateMany");
  assert.equal(calls[1][1].where.userId, 294);
});

test("applyAnonymousSessionEviction: ignores invalid user id", async () => {
  let touched = false;
  const prisma = {
    user: { update: async () => { touched = true; } },
    refreshToken: { updateMany: async () => { touched = true; } },
  };
  await applyAnonymousSessionEviction(prisma, 0);
  assert.equal(touched, false);
});
