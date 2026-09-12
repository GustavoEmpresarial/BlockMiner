/**
 * Real integration test for activateBoost against a live database — the actual
 * DB-integration coverage the unit tests in activateBoost.test.mjs (fake Prisma
 * client) intentionally deferred. Requires DATABASE_URL to point at a real
 * Postgres (run against the dev/staging DB, never production). Creates its own
 * disposable, uniquely-tagged users and always cleans them up in `after`, even on
 * failure — never touches any existing account or row.
 *
 * Skips itself gracefully (via node:test's `skip`) if DATABASE_URL isn't set, so
 * `npm test` in an environment without DB access still passes.
 */
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("activateBoost — live DB integration", { skip: !hasDb && "DATABASE_URL not set" }, () => {
  let prisma;
  let activateBoost;
  let BOOST_COST_POL;
  const createdUserIds = [];

  before(async () => {
    prisma = (await import("../../server/core/database/prisma.ts")).default;
    ({ activateBoost, BOOST_COST_POL } = await import("../../server/modules/boosts/boosts.service.ts"));
  });

  after(async () => {
    // Always clean up, regardless of which assertions passed/failed above.
    for (const userId of createdUserIds) {
      await prisma.auditLog.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.dailyPowerBoost.deleteMany({ where: { userId } }).catch(() => {});
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  async function makeDisposableUser(polBalance) {
    const tag = `integration-test-activateboost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        name: tag,
        email: `${tag}@blockminer.test`,
        passwordHash: "x", // never logged in with; irrelevant for this test
        polBalance,
      },
      select: { id: true, polBalance: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  test("activates successfully against the real DB: debits POL, persists a DailyPowerBoost row and an AuditLog entry", async () => {
    const user = await makeDisposableUser(1.0);

    const result = await activateBoost(user.id, "POL");

    assert.equal(result.ok, true);
    assert.equal(result.feePaid, BOOST_COST_POL);

    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { polBalance: true } });
    assert.equal(Number(fresh.polBalance), Number(user.polBalance) - BOOST_COST_POL);

    const boostRow = await prisma.dailyPowerBoost.findFirst({ where: { userId: user.id } });
    assert.ok(boostRow, "a DailyPowerBoost row must exist after activation");
    assert.equal(Number(boostRow.amountPol), BOOST_COST_POL);

    const auditRow = await prisma.auditLog.findFirst({ where: { userId: user.id, action: "power_boost_activated" } });
    assert.ok(auditRow, "activation must be audit-logged");
  });

  test("a second activation the same day is rejected as ALREADY_ACTIVE and does not debit again — the real @@unique([userId, dayKey]) constraint", async () => {
    const user = await makeDisposableUser(1.0);

    const first = await activateBoost(user.id, "POL");
    assert.equal(first.ok, true);

    const second = await activateBoost(user.id, "POL");
    assert.equal(second.ok, false);
    assert.equal(second.code, "ALREADY_ACTIVE");

    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { polBalance: true } });
    // Only the FIRST activation's debit should have applied — not two.
    assert.equal(Number(fresh.polBalance), Number(user.polBalance) - BOOST_COST_POL);

    const boostRows = await prisma.dailyPowerBoost.findMany({ where: { userId: user.id } });
    assert.equal(boostRows.length, 1, "exactly one boost row — the unique constraint blocked the second write");
  });

  test("rejects with INSUFFICIENT_BALANCE against the real DB and debits nothing when POL balance is 0", async () => {
    const user = await makeDisposableUser(0);

    const result = await activateBoost(user.id, "POL");

    assert.equal(result.ok, false);
    assert.equal(result.code, "INSUFFICIENT_BALANCE");

    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { polBalance: true } });
    assert.equal(Number(fresh.polBalance), 0);

    const boostRows = await prisma.dailyPowerBoost.findMany({ where: { userId: user.id } });
    assert.equal(boostRows.length, 0);
  });

  test("two concurrent activations for the same fresh user: exactly one succeeds, the other is ALREADY_ACTIVE, exactly one debit applied", async () => {
    const user = await makeDisposableUser(1.0);

    const [a, b] = await Promise.all([activateBoost(user.id, "POL"), activateBoost(user.id, "POL")]);
    const results = [a, b];
    const succeeded = results.filter((r) => r.ok);
    const rejected = results.filter((r) => !r.ok);

    assert.equal(succeeded.length, 1, "exactly one of the two concurrent activations must win");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].code, "ALREADY_ACTIVE");

    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { polBalance: true } });
    assert.equal(
      Number(fresh.polBalance),
      Number(user.polBalance) - BOOST_COST_POL,
      "the loser's debit must have rolled back — this is the real-DB proof for the fake-client unit test's rollback assumption",
    );

    const boostRows = await prisma.dailyPowerBoost.findMany({ where: { userId: user.id } });
    assert.equal(boostRows.length, 1);
  });
});
