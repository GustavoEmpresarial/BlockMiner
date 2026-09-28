import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const {
  adminCreateMiniPassSeason,
  adminUpdateMiniPassSeason,
  adminSoftDeleteMiniPassSeason,
  adminUpsertLevelReward,
  adminDeleteLevelReward,
  adminUpsertMission,
  adminDeleteMission,
} = await import("../../server/modules/mini-pass/mini-pass.admin.controller.ts");
const { applyMiniPassXp } = await import("../../server/modules/mini-pass/mini-pass.xp.service.ts");
const { claimMiniPassLevelReward } = await import("../../server/modules/mini-pass/mini-pass.claim.service.ts");
const { getMiniPassSeasonDashboard } = await import("../../server/modules/mini-pass/mini-pass.dashboard.service.ts");

function createMockReqRes({ admin = null, body = {}, params = {}, query = {}, headers = {} } = {}) {
  const req = {
    admin,
    body,
    params,
    query,
    headers: { "user-agent": "integration-test", "accept-language": "en", ...headers },
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

test("Mini Pass Integration: full season lifecycle, rewards, missions, XP progress, and claim", async () => {
  const ts = Date.now();
  let user = null;
  let seasonId = null;

  try {
    // 1. Criar usuário de teste
    user = await prisma.user.create({
      data: {
        name: "Mini Pass Test Player",
        username: `mp_user_${ts}`.slice(0, 20),
        email: `mp_user_${ts}@blockminer.test`,
        passwordHash: "dummy",
        polBalance: new Prisma.Decimal("50.00000000"),
        blkBalance: new Prisma.Decimal("10.00000000"),
      },
    });
    assert.ok(user.id > 0);

    // 2. Admin cria uma nova temporada
    const now = new Date();
    const createSeasonReq = createMockReqRes({
      admin: { adminId: 1, role: "admin", email: "admin@blockminer.test" },
      body: {
        slug: `season-test-${ts}`,
        titleI18n: { en: `Battle Season ${ts}`, ptBR: `Temporada ${ts}` },
        subtitleI18n: { en: "Test season progression" },
        startsAt: new Date(now.getTime() - 3600_000).toISOString(),
        endsAt: new Date(now.getTime() + 86400_000 * 30).toISOString(),
        maxLevel: 5,
        xpPerLevel: 100,
        buyLevelPricePol: "2.5",
        completePassPricePol: "10.0",
        isActive: true,
      },
    });

    await adminCreateMiniPassSeason(createSeasonReq.req, createSeasonReq.res);
    assert.equal(createSeasonReq.res.getStatusCode(), 201);
    assert.equal(createSeasonReq.res.getData()?.ok, true);
    const season = createSeasonReq.res.getData()?.season;
    assert.ok(season?.id > 0);
    seasonId = season.id;

    // 3. Admin cadastra recompensas por nível
    // Nível 1: POL (1.5 POL)
    const r1Req = createMockReqRes({
      admin: { adminId: 1, role: "admin" },
      params: { seasonId: String(seasonId) },
      body: {
        level: 1,
        rewardKind: "POL",
        polAmount: "1.5",
        titleI18n: { en: "1.5 POL Reward", ptBR: "Recompensa de 1.5 POL" },
        sortOrder: 1,
      },
    });
    await adminUpsertLevelReward(r1Req.req, r1Req.res);
    assert.equal(r1Req.res.getStatusCode(), 200);
    assert.equal(r1Req.res.getData()?.ok, true);
    const r1 = r1Req.res.getData()?.reward;
    assert.ok(r1?.id > 0);

    // Nível 2: Poder Temporário (50 H/s por 72h)
    const r2Req = createMockReqRes({
      admin: { adminId: 1, role: "admin" },
      params: { seasonId: String(seasonId) },
      body: {
        level: 2,
        rewardKind: "HASHRATE_TEMP",
        hashRate: 50,
        hashRateDays: 3,
        titleI18n: { en: "+50 H/s Boost (3d)" },
        sortOrder: 2,
      },
    });
    await adminUpsertLevelReward(r2Req.req, r2Req.res);
    assert.equal(r2Req.res.getStatusCode(), 200);
    assert.equal(r2Req.res.getData()?.ok, true);

    // 4. Admin cadastra uma missão
    const mReq = createMockReqRes({
      admin: { adminId: 1, role: "admin" },
      params: { seasonId: String(seasonId) },
      body: {
        cadence: "DAILY",
        missionType: "PLAY_GAMES",
        targetValue: "3",
        xpReward: 150,
        titleI18n: { en: "Play 3 Mini-Games" },
        descriptionI18n: { en: "Play any arcade game 3 times today" },
        sortOrder: 1,
      },
    });
    await adminUpsertMission(mReq.req, mReq.res);
    assert.equal(mReq.res.getStatusCode(), 200);
    assert.equal(mReq.res.getData()?.ok, true);
    const mission = mReq.res.getData()?.mission;
    assert.ok(mission?.id > 0);

    // 5. Jogador ganha XP da missão (150 XP => Nível 2)
    const xpOutcome1 = await applyMiniPassXp({
      userId: user.id,
      seasonId,
      amount: 150,
      source: "MISSION",
      idempotencyKey: `xp-test-mission-${ts}`,
      missionId: mission.id,
    });
    assert.equal(xpOutcome1.ok, true);
    assert.equal(xpOutcome1.duplicate, false);

    // Idempotência de XP: mesma chave não duplica
    const xpOutcome2 = await applyMiniPassXp({
      userId: user.id,
      seasonId,
      amount: 150,
      source: "MISSION",
      idempotencyKey: `xp-test-mission-${ts}`,
      missionId: mission.id,
    });
    assert.equal(xpOutcome2.ok, true);
    assert.equal(xpOutcome2.duplicate, true);

    // 6. Consultar dashboard do jogador
    const dash = await getMiniPassSeasonDashboard(user.id, seasonId, "en");
    assert.equal(dash.ok, true);
    assert.equal(dash.progress?.totalXp, 150);
    assert.equal(dash.progress?.level, 2); // Nível 2 desbloqueado
    assert.equal(dash.rewards?.length, 2);

    // 7. Jogador resgata recompensa de Nível 1 (POL)
    const claimRes1 = await claimMiniPassLevelReward(user.id, seasonId, r1.id);
    assert.equal(claimRes1.ok, true);
    assert.equal(claimRes1.duplicate, false);
    assert.equal(claimRes1.summary?.kind, "POL");

    // Validar saldo creditado no banco (50 + 1.5 = 51.5 POL)
    const userAfterClaim = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(Number(userAfterClaim.polBalance), 51.5);

    // Tentativa de resgate duplicado
    const claimDup = await claimMiniPassLevelReward(user.id, seasonId, r1.id);
    assert.equal(claimDup.ok, true);
    assert.equal(claimDup.duplicate, true);

    // 8. Admin edita a temporada (PATCH / PUT)
    const updateSeasonReq = createMockReqRes({
      admin: { adminId: 1, role: "admin" },
      params: { id: String(seasonId) },
      body: {
        maxLevel: 10,
        buyLevelPricePol: "3.0",
      },
    });
    await adminUpdateMiniPassSeason(updateSeasonReq.req, updateSeasonReq.res);
    assert.equal(updateSeasonReq.res.getStatusCode(), 200);
    assert.equal(updateSeasonReq.res.getData()?.season?.maxLevel, 10);

    // 9. Admin exclui a missão criada
    const delMissionReq = createMockReqRes({
      admin: { adminId: 1, role: "admin" },
      params: { seasonId: String(seasonId), missionId: String(mission.id) },
    });
    await adminDeleteMission(delMissionReq.req, delMissionReq.res);
    assert.equal(delMissionReq.res.getStatusCode(), 200);

    // 10. Admin soft-deleta a temporada
    const delSeasonReq = createMockReqRes({
      admin: { adminId: 1, role: "admin" },
      params: { id: String(seasonId) },
    });
    await adminSoftDeleteMiniPassSeason(delSeasonReq.req, delSeasonReq.res);
    assert.equal(delSeasonReq.res.getStatusCode(), 200);

    const deletedSeason = await prisma.miniPassSeason.findUnique({ where: { id: seasonId } });
    assert.ok(deletedSeason?.deletedAt != null);
    assert.equal(deletedSeason?.isActive, false);
  } finally {
    // Limpeza de dados de teste
    if (seasonId) {
      await prisma.userMiniPassRewardClaim.deleteMany({ where: { levelReward: { seasonId } } }).catch(() => {});
      await prisma.userMiniPassXpLedger.deleteMany({ where: { seasonId } }).catch(() => {});
      await prisma.userMiniPassEnrollment.deleteMany({ where: { seasonId } }).catch(() => {});
      await prisma.userMiniPassMissionProgress.deleteMany({ where: { mission: { seasonId } } }).catch(() => {});
      await prisma.userMiniPassMissionDedupeTick.deleteMany({ where: { mission: { seasonId } } }).catch(() => {});
      await prisma.miniPassLevelReward.deleteMany({ where: { seasonId } }).catch(() => {});
      await prisma.miniPassMission.deleteMany({ where: { seasonId } }).catch(() => {});
      await prisma.miniPassSeason.delete({ where: { id: seasonId } }).catch(() => {});
    }
    if (user?.id) {
      await prisma.userPowerGame.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.userOwnedMachine.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  }
});
