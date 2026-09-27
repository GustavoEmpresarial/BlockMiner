import test from "node:test";
import assert from "node:assert/strict";

const { TELEGRAM_EVENT_TYPES } = await import(
  "../../server/modules/notifications/telegram.types.ts"
);
const { buildGenericEventMessage } = await import(
  "../../server/modules/notifications/telegram.worker.ts"
);

test("TELEGRAM_EVENT_TYPES includes PTC_CAMPAIGN_SUBMITTED", () => {
  assert.equal(TELEGRAM_EVENT_TYPES.PTC_CAMPAIGN_SUBMITTED, "ptc_campaign_submitted");
});

test("buildGenericEventMessage formats PTC_CAMPAIGN_SUBMITTED HTML message properly", () => {
  const mockEvent = {
    id: 101,
    type: TELEGRAM_EVENT_TYPES.PTC_CAMPAIGN_SUBMITTED,
    userId: 42,
    usernameSnapshot: "crypto_advertiser",
    createdAt: new Date("2026-09-27T10:30:00Z"),
    payload: {
      campaignId: 88,
      title: "Melhor Faucet de SHIB & BTC",
      url: "https://example.com/promo?ref=123",
      targetViews: 500,
      durationSeconds: 15,
      adType: "window",
      costShib: "25000",
      createdAt: "2026-09-27T10:30:00Z",
    },
  };

  const message = buildGenericEventMessage(mockEvent);

  assert.ok(message.includes("Nova Campanha PTC Submetida"), "Deve conter o título do alerta");
  assert.ok(message.includes("@crypto_advertiser"), "Deve conter o username do anunciante");
  assert.ok(message.includes("(#42)"), "Deve conter o ID do usuário");
  assert.ok(message.includes("Melhor Faucet de SHIB &amp; BTC"), "Deve conter o título da campanha escapado com segurança");

  assert.ok(message.includes("https://example.com/promo?ref=123"), "Deve conter a URL do anúncio");
  assert.ok(message.includes("15s"), "Deve conter a duração");
  assert.ok(message.includes("500 views"), "Deve conter o número de visualizações");
  assert.ok(message.includes("25,000 SHIB") || message.includes("25.000 SHIB") || message.includes("25000 SHIB"), "Deve conter o custo");
  assert.ok(message.includes("#88"), "Deve conter o ID da campanha");
  assert.ok(message.includes("https://blockminer.space/admin/ptc"), "Deve conter o link do painel admin");
});

test("buildGenericEventMessage escapes special HTML characters in title and URL", () => {
  const mockEvent = {
    id: 102,
    type: TELEGRAM_EVENT_TYPES.PTC_CAMPAIGN_SUBMITTED,
    userId: 99,
    usernameSnapshot: "hacker<test>",
    createdAt: new Date("2026-09-27T10:30:00Z"),
    payload: {
      campaignId: 89,
      title: "Test <script>alert(1)</script> & Promo",
      url: "https://example.com/promo?a=1&b=2",
      targetViews: 100,
      durationSeconds: 10,
      adType: "iframe",
      costShib: "1000",
    },
  };

  const message = buildGenericEventMessage(mockEvent);

  assert.ok(!message.includes("<script>"), "HTML malicioso deve ser escapado");
  assert.ok(message.includes("&lt;script&gt;"), "Tag script deve ser sanitizada com entidades");
  assert.ok(message.includes("&amp;"), "E comercial deve ser escapado");
});
