import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env).
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { pruneOldNotifications, pruneOldTournamentScoreDrifts } = await import(
  "../../server/cron/notifications-retention.cron.ts"
);

const createdUserIds = [];
const createdNotificationIds = [];
const createdTournamentIds = [];
const createdDriftIds = [];

async function makeUser() {
  const suffix = `notifret_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Notifications Retention Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.50",
      ip: "203.0.113.50",
      userAgent: "test-agent/1.0",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeNotification(userId, createdAt) {
  const row = await prisma.notification.create({
    data: { userId, title: "t", message: "m", createdAt },
  });
  createdNotificationIds.push(row.id);
  return row;
}

async function makeTournament() {
  const t = await prisma.tournament.create({
    data: {
      name: `Cron Test Tournament ${Date.now()}`,
      type: "DAILY",
      metric: "HASHRATE",
      startsAt: new Date(Date.now() - 3600_000),
      endsAt: new Date(Date.now() + 3600_000),
    },
  });
  createdTournamentIds.push(t.id);
  return t;
}

async function makeDrift(tournamentId, detectedAt) {
  const row = await prisma.tournamentScoreDrift.create({
    data: { tournamentId, detectedAt },
  });
  createdDriftIds.push(row.id);
  return row;
}

test.after(async () => {
  await prisma.tournamentScoreDrift.deleteMany({ where: { id: { in: createdDriftIds } } });
  await prisma.tournament.deleteMany({ where: { id: { in: createdTournamentIds } } });
  await prisma.notification.deleteMany({ where: { id: { in: createdNotificationIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

test("pruneOldNotifications: deletes rows older than retention window, preserves recent ones", async () => {
  const user = await makeUser();
  const old = await makeNotification(user.id, new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)); // 40d old
  const recent = await makeNotification(user.id, new Date()); // now

  const deleted = await pruneOldNotifications(30, 5_000, 10);
  assert.ok(deleted >= 1);

  const [oldRow, recentRow] = await Promise.all([
    prisma.notification.findUnique({ where: { id: old.id } }),
    prisma.notification.findUnique({ where: { id: recent.id } }),
  ]);
  assert.equal(oldRow, null, "notification past retention must be deleted");
  assert.ok(recentRow, "recent notification must be preserved");
});

test("pruneOldNotifications: is idempotent and batch-bounded — running twice does not error or over-delete", async () => {
  const user = await makeUser();
  await makeNotification(user.id, new Date(Date.now() - 40 * 24 * 60 * 60 * 1000));

  const first = await pruneOldNotifications(30, 5_000, 10);
  assert.ok(first >= 1);
  const second = await pruneOldNotifications(30, 5_000, 10);
  assert.equal(second, 0, "nothing left to delete on second pass for this seed set");
});

test("pruneOldTournamentScoreDrifts: deletes drifts older than retention window, preserves recent ones and is idempotent", async () => {
  const t = await makeTournament();
  const old = await makeDrift(t.id, new Date(Date.now() - 40 * 24 * 60 * 60 * 1000));
  const recent = await makeDrift(t.id, new Date());

  const deleted = await pruneOldTournamentScoreDrifts(30);
  assert.ok(deleted >= 1);

  const [oldRow, recentRow] = await Promise.all([
    prisma.tournamentScoreDrift.findUnique({ where: { id: old.id } }),
    prisma.tournamentScoreDrift.findUnique({ where: { id: recent.id } }),
  ]);
  assert.equal(oldRow, null, "drift past retention must be deleted");
  assert.ok(recentRow, "recent drift must be preserved");

  const second = await pruneOldTournamentScoreDrifts(30);
  assert.equal(second, 0, "nothing left to delete on second pass for this seed set");
});
