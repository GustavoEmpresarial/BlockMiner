import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { createCampaign, createTier, deleteTier } = await import(
  "../../server/modules/ptc/ptc.service.ts"
);
const { TELEGRAM_EVENT_TYPES } = await import(
  "../../server/modules/notifications/telegram.types.ts"
);
const {
  processTelegramEvent,
  buildGenericEventMessage,
  getWorkerConfig,
} = await import("../../server/modules/notifications/telegram.worker.ts");

test("PTC Telegram End-to-End Smoke Test: Outbox persistence, formatting and mock delivery", async (t) => {
  const timestamp = Date.now();
  let advertiser = null;
  let testTier = null;
  let createdAd = null;
  let outboxEvent = null;

  try {
    // 1. Cria anunciante com saldo SHIB
    advertiser = await prisma.user.create({
      data: {
        email: `tg-ptc-${timestamp}@blockminer.test`,
        name: "Telegram Smoke Advertiser",
        username: `tg_adv_${timestamp}`.slice(0, 20),
        passwordHash: "$2a$10$dummyhashplaceholderforptctelegram1234567890",
        shibBalance: new Prisma.Decimal("50000"),
      },
    });

    // 2. Cria tier ativo
    testTier = await createTier({
      label: `TG Tier ${timestamp}`,
      adType: "window",
      durationSeconds: 15,
      pricePerViewShib: 5,
      rewardPerViewShib: 4,
      isActive: true,
      sortOrder: 1,
    });

    // 3. Submete campanha via serviço real
    await t.test("Submissão de campanha enfileira evento ptc_campaign_submitted com payload completo", async () => {
      await createCampaign(advertiser.id, {
        title: "Campanha Telegram Smoke Test",
        description: "Validando envio ponta a ponta para o bot",
        url: "https://blockminer.space/telegram-smoke-test",
        tierId: testTier.id,
        targetViews: 200, // Custo: 200 * 5 = 1000 SHIB
      });

      createdAd = await prisma.ptpAd.findFirst({
        where: { userId: advertiser.id, title: "Campanha Telegram Smoke Test" },
      });
      assert.ok(createdAd, "Campanha deve existir no banco de dados");

      // Consulta o outbox do Telegram
      outboxEvent = await prisma.telegramOutboxEvent.findFirst({
        where: {
          type: TELEGRAM_EVENT_TYPES.PTC_CAMPAIGN_SUBMITTED,
          userId: advertiser.id,
        },
        orderBy: { createdAt: "desc" },
      });

      assert.ok(outboxEvent, "Evento ptc_campaign_submitted deve ser gerado no outbox");
      assert.ok(["pending", "processing", "sent"].includes(outboxEvent.status));
      assert.equal(outboxEvent.usernameSnapshot, advertiser.username);

      const payload = outboxEvent.payload;
      assert.equal(payload.campaignId, createdAd.id);
      assert.equal(payload.title, "Campanha Telegram Smoke Test");
      assert.equal(payload.url, "https://blockminer.space/telegram-smoke-test");
      assert.equal(payload.targetViews, 200);
      assert.equal(payload.durationSeconds, 15);
      assert.equal(payload.adType, "window");
      assert.equal(payload.costShib, "1000");
    });

    // 4. Executa o despachante do worker com mock de fetch para testar a chamada à API do Telegram
    await t.test("processTelegramEvent: formata mensagem HTML rica e despacha para a API do Telegram", async () => {
      let interceptedCall = null;

      const mockFetch = async (method, botToken, body) => {
        interceptedCall = {
          method,
          botToken,
          payload: JSON.parse(body.body),
        };
        return { ok: true, result: { message_id: 12345 } };
      };

      const mockConfig = {
        botToken: "123456:TEST_BOT_TOKEN_MOCK",
        botTokenConfigured: true,
        privateChatId: "987654321",
        publicChatId: "11223344",
        publicThreadId: null,
        screenshotEnabled: false,
        maxAttempts: 5,
        batchSize: 5,
        polygonscanBaseUrl: "https://polygonscan.com",
      };

      const result = await processTelegramEvent(outboxEvent, mockConfig, mockFetch);
      assert.equal(result.sent, true, "Worker deve confirmar envio com sucesso");

      assert.ok(interceptedCall, "Chamada mockada deve ser capturada");
      assert.equal(interceptedCall.method, "sendMessage");
      assert.equal(interceptedCall.botToken, "123456:TEST_BOT_TOKEN_MOCK");
      assert.equal(interceptedCall.payload.chat_id, "987654321");
      assert.equal(interceptedCall.payload.parse_mode, "HTML");

      const sentHtml = interceptedCall.payload.text;
      assert.ok(sentHtml.includes("Nova Campanha PTC Submetida"));
      assert.ok(sentHtml.includes(`@${advertiser.username}`));
      assert.ok(sentHtml.includes("Campanha Telegram Smoke Test"));
      assert.ok(sentHtml.includes("https://blockminer.space/telegram-smoke-test"));
      assert.ok(sentHtml.includes("200 views"));
      assert.ok(sentHtml.includes("15s (window)"));
      assert.ok(
        sentHtml.includes("1,000 SHIB") || sentHtml.includes("1000 SHIB") || sentHtml.includes("1.000 SHIB"),
        `Deve conter o custo SHIB formatado (obtido: ${sentHtml})`,
      );

      assert.ok(sentHtml.includes(`ID Campanha:</b> #${createdAd.id}`));
      assert.ok(sentHtml.includes("https://blockminer.space/admin/ptc"));
    });
  } finally {
    // Cleanup
    if (createdAd) {
      await prisma.ptpView.deleteMany({ where: { adId: createdAd.id } });
      await prisma.ptpSession.deleteMany({ where: { adId: createdAd.id } });
      await prisma.ptpAd.delete({ where: { id: createdAd.id } }).catch(() => {});
    }
    if (outboxEvent) {
      await prisma.telegramOutboxEvent.deleteMany({ where: { id: outboxEvent.id } });
    }
    if (testTier) {
      await deleteTier(testTier.id).catch(() => {});
    }
    if (advertiser) {
      await prisma.user.delete({ where: { id: advertiser.id } }).catch(() => {});
    }
  }
});
