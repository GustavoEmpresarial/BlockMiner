import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const {
  createCampaign,
  approveCampaign,
  rejectCampaign,
  createTier,
  deleteTier,
  startSession,
  heartbeat,
  claimSession,
} = await import("../../server/modules/ptc/ptc.service.ts");

const { TELEGRAM_EVENT_TYPES } = await import(
  "../../server/modules/notifications/telegram.types.ts"
);

test("PTC End-to-End Smoke Test: Campaign lifecycle, Telegram alert, and reward claims", async (t) => {
  const timestamp = Date.now();
  let advertiser = null;
  let viewer = null;
  let testTier = null;
  let campaignId = null;
  let secondCampaignId = null;

  try {
    // 1. Setup configurações e usuários de teste
    await prisma.ptcSettings.upsert({
      where: { id: 1 },
      create: { id: 1, isEnabled: true, minViews: 100, maxViews: 1000000 },
      update: { isEnabled: true, minViews: 100, maxViews: 1000000 },
    });

    advertiser = await prisma.user.create({
      data: {
        email: `ptc-adv-${timestamp}@blockminer.test`,
        name: "PTC Advertiser",
        username: `adv_${timestamp}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholderforptcsmoke1234567890",
        shibBalance: new Prisma.Decimal("100000"), // 100k SHIB
      },
    });

    viewer = await prisma.user.create({
      data: {
        email: `ptc-view-${timestamp}@blockminer.test`,
        name: "PTC Viewer",
        username: `view_${timestamp}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholderforptcsmoke1234567890",
        shibBalance: new Prisma.Decimal("0"),
      },
    });

    // 2. Setup tier de teste
    testTier = await createTier({
      label: `Smoke Tier ${timestamp}`,
      adType: "window",
      durationSeconds: 1, // 1 segundo para teste rápido
      pricePerViewShib: 10,
      rewardPerViewShib: 8,
      isActive: true,
      sortOrder: 1,
    });
    assert.ok(testTier.id > 0, "Tier deve ser criado");

    // 3. Anunciante submete campanha
    await t.test("createCampaign: debita SHIB, persiste anúncio pendente e enfileira alerta Telegram", async () => {
      const ad = await createCampaign(advertiser.id, {
        title: "Campanha Smoke Test",
        description: "Descrição da campanha de teste",
        url: "https://blockminer.space/ptc-smoke",
        tierId: testTier.id,
        targetViews: 100, // Custo: 100 * 10 = 1000 SHIB
      });

      // Busca anúncio no banco
      const createdAd = await prisma.ptpAd.findFirst({
        where: { userId: advertiser.id, title: "Campanha Smoke Test" },
      });
      assert.ok(createdAd, "Anúncio deve existir no banco de dados");
      campaignId = createdAd.id;
      assert.equal(createdAd.status, "pending_approval");
      assert.equal(Number(createdAd.costShib), 1000);

      // Checa saldo do anunciante (100.000 - 1.000 = 99.000)
      const updatedAdv = await prisma.user.findUnique({ where: { id: advertiser.id } });
      assert.equal(Number(updatedAdv.shibBalance), 99000);

      // Checa se evento Telegram foi gravado no outbox
      const tgEvent = await prisma.telegramOutboxEvent.findFirst({
        where: {
          type: TELEGRAM_EVENT_TYPES.PTC_CAMPAIGN_SUBMITTED,
          userId: advertiser.id,
        },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(tgEvent, "Evento de notificação Telegram deve ter sido gravado na tabela outbox");
      assert.ok(
        ["pending", "processing", "sent"].includes(tgEvent.status),
        `Status do evento outbox deve ser pending/processing/sent (obtido: ${tgEvent.status})`,
      );
      const payload = tgEvent.payload;
      assert.equal(payload.campaignId, createdAd.id);
      assert.equal(payload.targetViews, 100);
      assert.equal(payload.url, "https://blockminer.space/ptc-smoke");
    });

    // 4. Admin aprova a campanha
    await t.test("approveCampaign: move anúncio para status active", async () => {
      await approveCampaign(campaignId);
      const activeAd = await prisma.ptpAd.findUnique({ where: { id: campaignId } });
      assert.equal(activeAd.status, "active");
    });

    // 5. Visualizador abre sessão, aguarda duração e faz claim da recompensa
    await t.test("PtcSession: inicia sessão, faz heartbeat e reivindica recompensa SHIB", async () => {
      // Inicia sessão
      const session = await startSession(viewer.id, campaignId);
      assert.ok(session?.id, "Sessão deve ser iniciada");

      // Primeiro heartbeat inicializa o timer em 'viewing'
      await heartbeat(session.id, viewer.id);

      // Aguarda o tempo necessário (duração do tier = 1s)
      await new Promise((r) => setTimeout(r, 1100));

      // Segundo heartbeat acumula o tempo e completa a sessão
      const hb = await heartbeat(session.id, viewer.id);
      assert.equal(hb.status, "completed", "Sessão deve alcançar status completed");

      // Claim
      await claimSession(session.id, viewer.id);

      // Checa saldo do viewer (deve ter 8 SHIB)
      const updatedViewer = await prisma.user.findUnique({ where: { id: viewer.id } });
      assert.equal(Number(updatedViewer.shibBalance), 8);


      // Checa visualização registrada
      const viewRecord = await prisma.ptpView.findFirst({
        where: { adId: campaignId, viewerHash: `user_${viewer.id}` },
      });
      assert.ok(viewRecord, "Registro PtpView deve ter sido persistido");
      assert.equal(Number(viewRecord.earnedShib), 8);
    });

    // 6. Teste de rejeição com estorno de SHIB
    await t.test("rejectCampaign: rejeita campanha e estorna SHIB não entregue para o anunciante", async () => {
      // Cria uma segunda campanha (100 views * 10 = 1000 SHIB)
      await createCampaign(advertiser.id, {
        title: "Campanha Para Rejeição",
        description: "Teste de rejeição",
        url: "https://blockminer.space/ptc-reject",
        tierId: testTier.id,
        targetViews: 100,
      });

      const adToReject = await prisma.ptpAd.findFirst({
        where: { userId: advertiser.id, title: "Campanha Para Rejeição" },
      });
      assert.ok(adToReject);
      secondCampaignId = adToReject.id;

      // Saldo antes da rejeição (99.000 - 1.000 = 98.000)
      const advBeforeReject = await prisma.user.findUnique({ where: { id: advertiser.id } });
      assert.equal(Number(advBeforeReject.shibBalance), 98000);

      // Admin rejeita
      await rejectCampaign(secondCampaignId, "Conteúdo inadequado para a plataforma");

      // Saldo após rejeição (98.000 + 1.000 = 99.000)
      const advAfterReject = await prisma.user.findUnique({ where: { id: advertiser.id } });
      assert.equal(Number(advAfterReject.shibBalance), 99000);

      const rejectedAd = await prisma.ptpAd.findUnique({ where: { id: secondCampaignId } });
      assert.equal(rejectedAd.status, "rejected");
      assert.equal(rejectedAd.rejectionReason, "Conteúdo inadequado para a plataforma");
    });
  } finally {
    // Cleanup cuidadoso
    if (secondCampaignId) {
      await prisma.ptpSession.deleteMany({ where: { adId: secondCampaignId } });
      await prisma.ptpView.deleteMany({ where: { adId: secondCampaignId } });
      await prisma.ptpAd.delete({ where: { id: secondCampaignId } }).catch(() => {});
    }
    if (campaignId) {
      await prisma.ptpSession.deleteMany({ where: { adId: campaignId } });
      await prisma.ptpView.deleteMany({ where: { adId: campaignId } });
      await prisma.ptpAd.delete({ where: { id: campaignId } }).catch(() => {});
    }
    if (testTier) {
      await deleteTier(testTier.id).catch(() => {});
    }
    if (advertiser) {
      await prisma.telegramOutboxEvent.deleteMany({ where: { userId: advertiser.id } });
      await prisma.user.delete({ where: { id: advertiser.id } }).catch(() => {});
    }
    if (viewer) {
      await prisma.user.delete({ where: { id: viewer.id } }).catch(() => {});
    }
  }
});
