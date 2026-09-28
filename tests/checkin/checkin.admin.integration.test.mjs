import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const {
  listCheckinMilestones,
  createCheckinMilestone,
  updateCheckinMilestone,
  deleteCheckinMilestone,
  listCheckinStreakAnomalies,
} = await import("../../server/modules/checkin/checkin.admin.controller.ts");
const { applyStreakMilestoneRewards } = await import(
  "../../server/modules/checkin/checkin.milestones.ts"
);
const { getUtcDayKey } = await import("../../server/shared/calendar/utcCalendar.ts");

function createMockReqRes({ admin = null, body = {}, params = {}, query = {}, headers = {} } = {}) {
  const req = {
    admin,
    body,
    params,
    query,
    headers: { "user-agent": "integration-test", ...headers },
    ip: "127.0.0.1",
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };

  let statusCode = 200;
  let sentData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      sentData = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return sentData;
    },
  };

  return { req, res };
}

test("Checkin Milestones Integration: full admin CRUD, streak reward delivery and anomaly scan", async () => {
  const ts = Date.now();
  const baseThreshold = 7000 + (ts % 2000);
  let user = null;
  let createdMilestoneId = null;

  try {
    // 1. Criar usuário de teste
    user = await prisma.user.create({
      data: {
        name: "Checkin Admin Test User",
        username: `ck_admin_${ts}`.slice(0, 20),
        email: `ck_admin_${ts}@blockminer.test`,
        passwordHash: "dummy",
      },
    });
    assert.ok(user.id > 0);

    // 2. Admin lista marcos existentes
    const listReq = createMockReqRes({ admin: { adminId: 1, role: "admin" } });
    await listCheckinMilestones(listReq.req, listReq.res);
    assert.equal(listReq.res.getStatusCode(), 200);
    assert.equal(listReq.res.getData()?.ok, true);
    assert.ok(Array.isArray(listReq.res.getData()?.milestones));

    // 3. Admin cria novo marco em POL
    const createReq = createMockReqRes({
      admin: { adminId: 1, role: "admin", email: "admin@blockminer.test" },
      body: {
        dayThreshold: baseThreshold,
        rewardType: "pol",
        rewardValue: 2.5,
        active: true,
        sortOrder: 5,
      },
    });
    await createCheckinMilestone(createReq.req, createReq.res);
    assert.equal(createReq.res.getStatusCode(), 201);
    assert.equal(createReq.res.getData()?.ok, true);
    const createdMilestone = createReq.res.getData()?.milestone;
    assert.ok(createdMilestone?.id > 0);
    createdMilestoneId = createdMilestone.id;
    assert.equal(createdMilestone.dayThreshold, baseThreshold);
    assert.equal(createdMilestone.rewardValue, 2.5);

    // 4. Admin atualiza o marco (ativa/desativa e muda valor)
    const updateReq = createMockReqRes({
      admin: { adminId: 1, role: "admin", email: "admin@blockminer.test" },
      params: { id: String(createdMilestoneId) },
      body: {
        dayThreshold: baseThreshold,
        rewardType: "pol",
        rewardValue: 5.0,
        active: true,
        sortOrder: 10,
      },
    });
    await updateCheckinMilestone(updateReq.req, updateReq.res);
    assert.equal(updateReq.res.getStatusCode(), 200);
    assert.equal(updateReq.res.getData()?.ok, true);
    assert.equal(updateReq.res.getData()?.milestone.rewardValue, 5.0);

    // 5. Simular streak do jogador atingindo o marco
    const today = getUtcDayKey(new Date());
    await prisma.dailyCheckin.create({
      data: {
        userId: user.id,
        checkinDate: today,
        status: "confirmed",
        confirmedAt: new Date(),
        txHash: `tx-checkin-milestone-${ts}`,
        chainId: 137,
        streak: baseThreshold, // Simula streak correspondente
      },
    });

    // 6. Aplicar recompensas de streak e validar entrega no reward inbox
    const rewardOutcome = await applyStreakMilestoneRewards(user.id);
    const grantedMatch = rewardOutcome.granted.find((g) => g.milestoneId === createdMilestoneId);
    assert.ok(grantedMatch, "o marco criado deve ser concedido ao jogador");

    const inboxEntry = await prisma.userRewardInbox.findFirst({
      where: { userId: user.id, source: "checkin_milestone", rewardType: "pol", rewardValue: new Prisma.Decimal("5.0") },
    });
    assert.ok(inboxEntry, "deve existir entrada no reward inbox com 5.0 POL");
    assert.equal(Number(inboxEntry.rewardValue), 5.0);

    const claimRow = await prisma.userCheckinStreakReward.findUnique({
      where: { userId_milestoneId: { userId: user.id, milestoneId: createdMilestoneId } },
    });
    assert.ok(claimRow, "registro de claim de marco deve existir");

    // 7. Re-execução não duplica concessão (idempotente)
    const secondOutcome = await applyStreakMilestoneRewards(user.id);
    const duplicateMatch = secondOutcome.granted.find((g) => g.milestoneId === createdMilestoneId);
    assert.equal(duplicateMatch, undefined, "não deve duplicar concessão");

    // 8. Scanner de anomalias operacional
    const anomalyReq = createMockReqRes({ admin: { adminId: 1, role: "admin" } });
    await listCheckinStreakAnomalies(anomalyReq.req, anomalyReq.res);
    assert.equal(anomalyReq.res.getStatusCode(), 200);
    assert.equal(anomalyReq.res.getData()?.ok, true);
    assert.ok(Array.isArray(anomalyReq.res.getData()?.anomalies));

    // 9. Admin exclui o marco criado
    const deleteReq = createMockReqRes({
      admin: { adminId: 1, role: "admin", email: "admin@blockminer.test" },
      params: { id: String(createdMilestoneId) },
    });
    await deleteCheckinMilestone(deleteReq.req, deleteReq.res);
    assert.equal(deleteReq.res.getStatusCode(), 200);
    assert.equal(deleteReq.res.getData()?.ok, true);

    const deletedCheck = await prisma.checkinStreakMilestone.findUnique({
      where: { id: createdMilestoneId },
    });
    assert.equal(deletedCheck, null);
    createdMilestoneId = null;
  } finally {
    if (createdMilestoneId) {
      await prisma.userCheckinStreakReward.deleteMany({ where: { milestoneId: createdMilestoneId } }).catch(() => {});
      await prisma.checkinStreakMilestone.delete({ where: { id: createdMilestoneId } }).catch(() => {});
    }
    if (user?.id) {
      await prisma.userRewardInbox.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.userCheckinStreakReward.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.dailyCheckin.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  }
});
