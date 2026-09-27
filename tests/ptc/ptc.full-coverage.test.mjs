import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const svc = await import("../../server/modules/ptc/ptc.service.ts");
const repo = await import("../../server/modules/ptc/ptc.repository.ts");
const { PTC_ERROR_MESSAGE, PtcRejectedError } = await import(
  "../../server/modules/ptc/ptc.errors.ts"
);
const adminCtrl = await import("../../server/modules/ptc/ptc.admin.controller.ts");
const userCtrl = await import("../../server/modules/ptc/ptc.controller.ts");

function createMockRes() {
  let statusCode = 200;
  let sentData = null;
  return {
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
}

test("PtcRejectedError error class test", () => {
  const err = new PtcRejectedError("Custom rejection reason");
  assert.equal(err.name, "PtcRejectedError");
  assert.equal(err.message, "Custom rejection reason");
  assert.ok(err instanceof Error);
});

test("ptc.repository: wasViewedOnUtcDay date permutations and null fallbacks", () => {
  const d = new Date("2026-09-27T10:00:00Z");
  assert.equal(repo.wasViewedOnUtcDay(null, null, d), false);
  assert.equal(repo.wasViewedOnUtcDay(undefined, undefined, d), false);
  assert.equal(repo.wasViewedOnUtcDay(d, null, d), true);
  assert.equal(repo.wasViewedOnUtcDay(null, d, d), true);
});

test("PTC Service & Controller Full Boundary & Branch Coverage", async (t) => {
  const timestamp = Date.now();
  let advUser = null;
  let viewerUser = null;
  let tier = null;
  let inactiveTier = null;
  let adId = null;

  try {
    advUser = await prisma.user.create({
      data: {
        email: `cov-adv-${timestamp}@blockminer.test`,
        name: "Coverage Advertiser",
        username: `cadv_${timestamp}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholder12345678901234567890",
        shibBalance: new Prisma.Decimal("500000"),
      },
    });

    viewerUser = await prisma.user.create({
      data: {
        email: `cov-view-${timestamp}@blockminer.test`,
        name: "Coverage Viewer",
        username: `cview_${timestamp}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholder12345678901234567890",
        shibBalance: new Prisma.Decimal("10000"),
      },
    });

    tier = await svc.createTier({
      label: `Cov Tier ${timestamp}`,
      adType: "window",
      durationSeconds: 1,
      pricePerViewShib: 2,
      rewardPerViewShib: 1,
      isActive: true,
      sortOrder: 1,
    });

    inactiveTier = await svc.createTier({
      label: `Inactive Tier ${timestamp}`,
      adType: "window",
      durationSeconds: 5,
      pricePerViewShib: 2,
      rewardPerViewShib: 1,
      isActive: false,
      sortOrder: 2,
    });

    // ── createCampaign branches ───────────────────────────────────────────────
    await t.test("createCampaign: falha se sistema estiver desabilitado", async () => {
      await prisma.ptcSettings.update({ where: { id: 1 }, data: { isEnabled: false } });
      await assert.rejects(
        () =>
          svc.createCampaign(advUser.id, {
            title: "Disabled",
            description: "",
            url: "https://example.com",
            tierId: tier.id,
            targetViews: 100,
          }),
        { message: PTC_ERROR_MESSAGE.DISABLED },
      );
      await prisma.ptcSettings.update({ where: { id: 1 }, data: { isEnabled: true } });
    });

    await t.test("createCampaign: falha se tier estiver inativo", async () => {
      await assert.rejects(
        () =>
          svc.createCampaign(advUser.id, {
            title: "Inactive Tier",
            description: "",
            url: "https://example.com",
            tierId: inactiveTier.id,
            targetViews: 100,
          }),
        { message: PTC_ERROR_MESSAGE.TIER_UNAVAILABLE },
      );
    });

    await t.test("createCampaign: cria campanha válida para testes subsequentes", async () => {
      await svc.createCampaign(advUser.id, {
        title: "Campanha Cobertura Total",
        description: "Testando todas as branches",
        url: "https://example.com/coverage",
        tierId: tier.id,
        targetViews: 100,
      });

      const dbAd = await prisma.ptpAd.findFirst({
        where: { userId: advUser.id, title: "Campanha Cobertura Total" },
      });
      assert.ok(dbAd);
      adId = dbAd.id;
    });

    // ── editCampaign branches ─────────────────────────────────────────────────
    await t.test("editCampaign: ativa e pausa campanha", async () => {
      // Simula anúncio ativo
      await prisma.ptpAd.update({ where: { id: adId }, data: { status: "active" } });
      await svc.editCampaign(advUser.id, adId, { active: false });
      let updated = await prisma.ptpAd.findUnique({ where: { id: adId } });
      assert.equal(updated.status, "paused");

      await svc.editCampaign(advUser.id, adId, { active: true });
      updated = await prisma.ptpAd.findUnique({ where: { id: adId } });
      assert.equal(updated.status, "active");
    });

    await t.test("editCampaign: impede edição quando anúncio estiver completado ou rejeitado", async () => {
      await prisma.ptpAd.update({ where: { id: adId }, data: { status: "completed" } });
      await assert.rejects(
        () => svc.editCampaign(advUser.id, adId, { title: "Novo Titulo" }),
        { message: PTC_ERROR_MESSAGE.CAMPAIGN_LOCKED },
      );

      await prisma.ptpAd.update({ where: { id: adId }, data: { status: "rejected" } });
      await assert.rejects(
        () => svc.editCampaign(advUser.id, adId, { title: "Novo Titulo" }),
        { message: PTC_ERROR_MESSAGE.CAMPAIGN_LOCKED },
      );
    });

    // ── addViews & removeViews branches ───────────────────────────────────────
    await t.test("addViews: bloqueia quando campanha estiver travada ou exceder maxViews", async () => {
      await assert.rejects(
        () => svc.addViews(advUser.id, adId, 10),
        { message: PTC_ERROR_MESSAGE.CAMPAIGN_LOCKED_VIEWS_ADD },
      );

      await prisma.ptpAd.update({ where: { id: adId }, data: { status: "active" } });
      await assert.rejects(
        () => svc.addViews(advUser.id, adId, 2000000), // Excede maxViews (1.000.000)
        /Max views is/,
      );
    });

    await t.test("removeViews: bloqueia quando campanha estiver travada ou reduzir além das entregues", async () => {
      await prisma.ptpAd.update({ where: { id: adId }, data: { status: "completed" } });
      await assert.rejects(
        () => svc.removeViews(advUser.id, adId, 10),
        { message: PTC_ERROR_MESSAGE.CAMPAIGN_LOCKED_VIEWS_REMOVE },
      );

      await prisma.ptpAd.update({ where: { id: adId }, data: { status: "active", views: 80, targetViews: 100 } });
      await assert.rejects(
        () => svc.removeViews(advUser.id, adId, 30), // 100 - 30 = 70 < views entregues (80)
        /Cannot reduce below delivered views/,
      );
    });

    // ── approveCampaign & rejectCampaign branches ─────────────────────────────
    await t.test("approveCampaign e rejectCampaign: erro em campanhas inexistentes ou não pendentes", async () => {
      await assert.rejects(() => svc.approveCampaign(999999), {
        message: PTC_ERROR_MESSAGE.CAMPAIGN_NOT_FOUND,
      });

      // Anúncio ativo não pode ser aprovado novamente
      await assert.rejects(() => svc.approveCampaign(adId), {
        message: PTC_ERROR_MESSAGE.NOT_PENDING_APPROVAL,
      });

      await assert.rejects(() => svc.rejectCampaign(999999, "reason"), {
        message: PTC_ERROR_MESSAGE.CAMPAIGN_NOT_FOUND,
      });

      await assert.rejects(() => svc.rejectCampaign(adId, "reason"), {
        message: PTC_ERROR_MESSAGE.NOT_PENDING_APPROVAL,
      });
    });

    // ── startSession, heartbeat, pauseSession & claimSession branches ──────────
    await t.test("Session branches: startSession, heartbeat, pause e claim erros", async () => {
      // Inicia sessão normal
      const session = await svc.startSession(viewerUser.id, adId);

      // Heartbeat com userId incorreto
      await assert.rejects(() => svc.heartbeat(session.id, 999999), {
        message: PTC_ERROR_MESSAGE.SESSION_NOT_FOUND,
      });

      // Pause com userId incorreto
      await assert.rejects(() => svc.pauseSession(session.id, 999999), {
        message: PTC_ERROR_MESSAGE.SESSION_NOT_FOUND,
      });

      // Claim antes de completar
      await assert.rejects(() => svc.claimSession(session.id, viewerUser.id), {
        message: PTC_ERROR_MESSAGE.SESSION_NOT_COMPLETE,
      });

      // Completa sessão
      await svc.heartbeat(session.id, viewerUser.id);
      await new Promise((r) => setTimeout(r, 1100));
      const completedSess = await svc.heartbeat(session.id, viewerUser.id);
      assert.equal(completedSess.status, "completed");

      // Heartbeat em sessão completada retorna ela mesma
      const hbOnComplete = await svc.heartbeat(session.id, viewerUser.id);
      assert.equal(hbOnComplete.status, "completed");

      // Pause em sessão completada retorna ela mesma
      const pauseOnComplete = await svc.pauseSession(session.id, viewerUser.id);
      assert.equal(pauseOnComplete.status, "completed");

      // Claim da sessão com sucesso
      await svc.claimSession(session.id, viewerUser.id);

      // Claim repetido na mesma sessão
      await assert.rejects(() => svc.claimSession(session.id, viewerUser.id), {
        message: PTC_ERROR_MESSAGE.SESSION_REWARD_ALREADY_CLAIMED,
      });

      // Heartbeat em sessão claimed
      await assert.rejects(() => svc.heartbeat(session.id, viewerUser.id), {
        message: PTC_ERROR_MESSAGE.SESSION_ALREADY_CLAIMED,
      });

      // Iniciar outra sessão no mesmo anúncio hoje deve falhar (ALREADY_VIEWED_TODAY)
      await assert.rejects(() => svc.startSession(viewerUser.id, adId), {
        message: PTC_ERROR_MESSAGE.ALREADY_VIEWED_TODAY,
      });
    });

    // ── Controllers HTTP Handler Coverage ─────────────────────────────────────
    await t.test("Controllers: Chamadas HTTP diretas com sucesso para cobertura completa", async () => {
      const mockReq = { user: advUser, params: { id: String(adId) }, body: {}, query: {} };

      // User editCampaign
      const resEdit = createMockRes();
      await userCtrl.editCampaign({ ...mockReq, body: { title: "Edit via Controller" } }, resEdit);
      assert.equal(resEdit.getStatusCode(), 200);

      // User getMyCampaigns
      const resMy = createMockRes();
      await userCtrl.getMyCampaigns(mockReq, resMy);
      assert.equal(resMy.getStatusCode(), 200);

      // User getActiveSession
      const resActive = createMockRes();
      await userCtrl.getActiveSession(mockReq, resActive);
      assert.equal(resActive.getStatusCode(), 200);

      // Admin approve e reject via controller com anúncio pendente
      const tempAd = await prisma.ptpAd.create({
        data: {
          userId: advUser.id,
          tierId: tier.id,
          title: "Ad para Controller",
          url: "https://example.com/ctrl",
          hash: `ctrl_${Date.now()}`,
          durationSeconds: 10,
          targetViews: 100,
          costShib: 200,
          rewardPerViewShib: 1,
          status: "pending_approval",
        },
      });

      const resApprove = createMockRes();
      await adminCtrl.approve({ params: { id: String(tempAd.id) }, ip: "127.0.0.1", headers: {} }, resApprove);
      assert.equal(resApprove.getStatusCode(), 200);

      const tempAd2 = await prisma.ptpAd.create({
        data: {
          userId: advUser.id,
          tierId: tier.id,
          title: "Ad para Rejeição",
          url: "https://example.com/ctrl2",
          hash: `ctrl2_${Date.now()}`,
          durationSeconds: 10,
          targetViews: 100,
          costShib: 200,
          rewardPerViewShib: 1,
          status: "pending_approval",
        },
      });

      const resReject = createMockRes();
      await adminCtrl.reject(
        { params: { id: String(tempAd2.id) }, body: { reason: "Teste" }, ip: "127.0.0.1", headers: {} },
        resReject,
      );
      assert.equal(resReject.getStatusCode(), 200);

      // Clean temp ads
      await prisma.ptpAd.deleteMany({ where: { id: { in: [tempAd.id, tempAd2.id] } } });
    });
  } finally {
    // Cleanup
    if (adId) {
      await prisma.ptpSession.deleteMany({ where: { adId } });
      await prisma.ptpView.deleteMany({ where: { adId } });
      await prisma.ptpAd.delete({ where: { id: adId } }).catch(() => {});
    }
    if (tier) {
      await prisma.ptcAdTier.delete({ where: { id: tier.id } }).catch(() => {});
    }
    if (inactiveTier) {
      await prisma.ptcAdTier.delete({ where: { id: inactiveTier.id } }).catch(() => {});
    }
    if (advUser) {
      await prisma.telegramOutboxEvent.deleteMany({ where: { userId: advUser.id } });
      await prisma.user.delete({ where: { id: advUser.id } }).catch(() => {});
    }
    if (viewerUser) {
      await prisma.ptpEarning.deleteMany({ where: { userId: viewerUser.id } });
      await prisma.user.delete({ where: { id: viewerUser.id } }).catch(() => {});
    }
  }
});
