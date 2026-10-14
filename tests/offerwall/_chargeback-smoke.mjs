/**
 * Shared chargeback smoke flow for partner walls (Offerwall.me / Offerwall.GG):
 * credit → tournament point → chargeback → BLK, part and point gone → replay is a no-op,
 * plus chargeback-before-credit stores an audit row without debiting.
 * Requires DATABASE_URL; set the provider secret env before importing the service.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.TOURNAMENT_ENGINE_V2 = "1";
process.env.OFFERWALL_SUBID_SECRET = "";

const prisma = (await import("../../server/core/database/prisma.ts")).default;
const { recordTournamentAction, reverseTournamentAction } = await import(
  "../../server/modules/tournaments/tournaments.actions.ts"
);
const { applyContribution } = await import("../../server/modules/tournaments/tournaments.projection.ts");
const { contributionSourceId } = await import("../../server/modules/tournaments/tournaments.providers.ts");
const { blkForOfferwallClicks } = await import("../../server/shared/offerwallBlkPayout.ts");

const HOUR_MS = 60 * 60 * 1000;

async function createUser(tag) {
  const stamp = `${Date.now()}_${crypto.randomInt(1000, 9999)}`;
  return prisma.user.create({
    data: {
      name: `Chargeback smoke ${tag}`,
      email: `cb_${tag}_${stamp}@blockminer.test`,
      username: `cb_${tag}_${stamp}`.slice(0, 30),
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
      blkBalance: 0,
    },
  });
}

async function createActiveTournament(tag) {
  const now = Date.now();
  return prisma.tournament.create({
    data: {
      name: `Chargeback smoke ${tag}`,
      type: "CUSTOM",
      metric: "OFFERS_EXTERNAL",
      status: "ACTIVE",
      startsAt: new Date(now - HOUR_MS),
      endsAt: new Date(now + HOUR_MS),
    },
  });
}

async function entryScore(tournamentId, userId) {
  const row = await prisma.tournamentEntry.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });
  return Number(row?.score ?? 0);
}

async function blk(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { blkBalance: true } });
  return Number(u.blkBalance);
}

/**
 * @param {object} p
 * @param {string} p.provider          tournament provider + part grant source ("offerwallme" | "offerwallgg")
 * @param {string} p.callbackModel     prisma delegate name ("offerwallMeCallback" | "offerwallGgCallback")
 * @param {(userId: number, transId: string) => Promise<{kind: string}>} p.sendCredit
 * @param {(userId: number, transId: string) => Promise<{kind: string}>} p.sendChargeback
 */
export async function runChargebackSmoke(t, p) {
  const callbacks = prisma[p.callbackModel];
  const expectedBlk = Number(blkForOfferwallClicks(1));

  await t.test(`${p.provider}: chargeback after credit removes BLK, part and tournament point`, async () => {
    const user = await createUser(p.provider);
    const tournament = await createActiveTournament(p.provider);
    const transId = `cb-smoke-${p.provider}-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
    try {
      assert.equal((await p.sendCredit(user.id, transId)).kind, "ok");
      const creditedAt = (await callbacks.findUnique({ where: { transId } })).createdAt;
      // Service fires the tournament hook without awaiting; replaying it is idempotent.
      await recordTournamentAction({
        userId: user.id,
        provider: p.provider,
        actionCount: 1,
        executedAtUTC: creditedAt,
        providerEventId: transId,
      });
      // Same projection the outbox drain performs — applied directly so a backlog of unrelated
      // pending outbox rows in a dev DB cannot starve this event. Duplicate-safe.
      await applyContribution(tournament.id, {
        userId: user.id,
        sourceType: "action",
        sourceId: contributionSourceId(p.provider, transId),
        metricValue: 1,
        eventAt: creditedAt,
      });

      assert.equal(await blk(user.id), expectedBlk);
      assert.equal(await entryScore(tournament.id, user.id), 1);
      const grant = await prisma.partGrant.findUnique({
        where: { source_sourceRef: { source: p.provider, sourceRef: transId } },
      });
      assert.ok(grant, "credit must grant a part");
      assert.equal(grant.reversedAt, null);

      assert.equal((await p.sendChargeback(user.id, transId)).kind, "ok");
      await reverseTournamentAction({ provider: p.provider, providerEventId: transId });

      const row = await callbacks.findUnique({ where: { transId } });
      assert.equal(row.status, 2, "credit row flips to chargeback");
      assert.equal(await blk(user.id), 0, "BLK credited by the offer is debited");
      const grantAfter = await prisma.partGrant.findUnique({ where: { id: grant.id } });
      assert.ok(grantAfter.reversedAt, "part grant is reversed");
      const stack = await prisma.userPartStack.findFirst({
        where: { userId: user.id, partSlug: grant.partSlug },
      });
      assert.equal(stack?.quantity ?? 0, 0, "part leaves the inventory");
      assert.equal(await entryScore(tournament.id, user.id), 0, "tournament point is removed");
      const action = await prisma.tournamentAction.findUnique({
        where: { provider_sourceId: { provider: p.provider, sourceId: transId } },
      });
      assert.equal(action.tournamentEligible, false);

      // Replay of the same chargeback changes nothing.
      assert.equal((await p.sendChargeback(user.id, transId)).kind, "ok");
      await reverseTournamentAction({ provider: p.provider, providerEventId: transId });
      assert.equal(await blk(user.id), 0);
      assert.equal(await entryScore(tournament.id, user.id), 0);
      assert.equal(await callbacks.count({ where: { transId } }), 1);
    } finally {
      await prisma.tournamentDomainOutbox
        .deleteMany({ where: { idempotencyKey: { contains: transId } } })
        .catch(() => {});
      await prisma.tournament.delete({ where: { id: tournament.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  });

  await t.test(`${p.provider}: chargeback with no prior credit stores an audit row and debits nothing`, async () => {
    const user = await createUser(`${p.provider}_nc`);
    const transId = `cb-smoke-nc-${p.provider}-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
    try {
      await prisma.user.update({ where: { id: user.id }, data: { blkBalance: 1 } });
      assert.equal((await p.sendChargeback(user.id, transId)).kind, "ok");
      const row = await callbacks.findUnique({ where: { transId } });
      assert.equal(row.status, 2);
      assert.equal(Number(row.polCredited), 0);
      assert.equal(await blk(user.id), 1);

      // A late credit for the same transaction is a duplicate, not a fresh credit.
      assert.equal((await p.sendCredit(user.id, transId)).kind, "ok");
      assert.equal(await blk(user.id), 1);
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  });
}
