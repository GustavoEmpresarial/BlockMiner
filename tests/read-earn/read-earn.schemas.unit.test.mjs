import test from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";

const {
  readEarnAdminCreateSchema,
  readEarnAdminUpdateSchema,
  readEarnRedeemBodySchema,
  parseReadEarnCreate,
  parseReadEarnUpdate,
  parseReadEarnRedeem,
} = await import("../../server/modules/read-earn/read-earn.schemas.ts");

const { READ_EARN_BLK, READ_EARN_HASHRATE, READ_EARN_MACHINE } = await import(
  "../../server/modules/read-earn/read-earn.errors.ts"
);

// ─── readEarnAdminCreateSchema ────────────────────────────────────────────────

test("readEarnAdminCreateSchema: payload válido de BLK passa com defaults", () => {
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 86_400_000);

  const res = parseReadEarnCreate({
    title: "Campanha Parceiro BLK",
    partnerUrl: "https://blockminer.space/blog/read-1",
    rewardCode: "SECRET2026",
    rewardType: READ_EARN_BLK,
    rewardAmount: 5,
    startsAt: now.toISOString(),
    expiresAt: later.toISOString(),
  });

  assert.equal(res.title, "Campanha Parceiro BLK");
  assert.equal(res.rewardType, "blk");
  assert.equal(res.rewardAmount, 5);
  assert.equal(res.hashrateValidityDays, 7); // default
  assert.equal(res.sortOrder, 0); // default
  assert.equal(res.isActive, true); // default
});

test("readEarnAdminCreateSchema: payload válido de hashrate passa", () => {
  const now = new Date();
  const later = new Date(now.getTime() + 14 * 86_400_000);

  const res = parseReadEarnCreate({
    title: "Campanha Hashrate",
    partnerUrl: "https://example.com/read",
    rewardCode: "BOOST2026",
    rewardType: READ_EARN_HASHRATE,
    rewardAmount: 50,
    hashrateValidityDays: 14,
    startsAt: now.toISOString(),
    expiresAt: later.toISOString(),
    maxRedemptions: 100,
  });

  assert.equal(res.rewardType, "hashrate");
  assert.equal(res.hashrateValidityDays, 14);
  assert.equal(res.maxRedemptions, 100);
});

test("readEarnAdminCreateSchema: payload de machine requer rewardMinerId válido", () => {
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 86_400_000);

  // Sem minerId deve falhar
  assert.throws(
    () =>
      parseReadEarnCreate({
        title: "Campanha Machine Sem Miner",
        partnerUrl: "https://example.com/read",
        rewardCode: "MACHINE123",
        rewardType: READ_EARN_MACHINE,
        rewardAmount: 1,
        startsAt: now.toISOString(),
        expiresAt: later.toISOString(),
      }),
    ZodError,
  );

  // Com minerId válido deve passar
  const valid = parseReadEarnCreate({
    title: "Campanha Machine Com Miner",
    partnerUrl: "https://example.com/read",
    rewardCode: "MACHINE123",
    rewardType: READ_EARN_MACHINE,
    rewardAmount: 1,
    rewardMinerId: 42,
    startsAt: now.toISOString(),
    expiresAt: later.toISOString(),
  });

  assert.equal(valid.rewardType, "machine");
  assert.equal(valid.rewardMinerId, 42);
});

test("readEarnAdminCreateSchema: validação cruzada expiresAt > startsAt", () => {
  const now = new Date();
  const past = new Date(now.getTime() - 1000);

  assert.throws(
    () =>
      parseReadEarnCreate({
        title: "Data inválida",
        partnerUrl: "https://example.com",
        rewardCode: "CODE123",
        rewardType: "blk",
        rewardAmount: 1,
        startsAt: now.toISOString(),
        expiresAt: past.toISOString(), // expirou antes de começar
      }),
    ZodError,
  );
});

test("readEarnAdminCreateSchema: rejeita URL inválida e esquemas perigosos", () => {
  const now = new Date();
  const later = new Date(now.getTime() + 86_400_000);

  const invalidUrls = [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.com",
    "not-a-url",
  ];

  for (const url of invalidUrls) {
    assert.throws(
      () =>
        parseReadEarnCreate({
          title: "URL perigosa",
          partnerUrl: url,
          rewardCode: "CODE1234",
          rewardType: "blk",
          rewardAmount: 1,
          startsAt: now.toISOString(),
          expiresAt: later.toISOString(),
        }),
      ZodError,
      `Deveria rejeitar: ${url}`,
    );
  }
});

test("readEarnAdminCreateSchema: valida comprimento do rewardCode (min 6, max 128)", () => {
  const now = new Date();
  const later = new Date(now.getTime() + 86_400_000);

  // Menor que 6
  assert.throws(
    () =>
      parseReadEarnCreate({
        title: "Código curto",
        partnerUrl: "https://example.com",
        rewardCode: "12345",
        rewardType: "blk",
        rewardAmount: 1,
        startsAt: now.toISOString(),
        expiresAt: later.toISOString(),
      }),
    ZodError,
  );

  // Maior que 128
  assert.throws(
    () =>
      parseReadEarnCreate({
        title: "Código longo",
        partnerUrl: "https://example.com",
        rewardCode: "a".repeat(129),
        rewardType: "blk",
        rewardAmount: 1,
        startsAt: now.toISOString(),
        expiresAt: later.toISOString(),
      }),
    ZodError,
  );
});

// ─── readEarnAdminUpdateSchema ────────────────────────────────────────────────

test("readEarnAdminUpdateSchema: objeto vazio passa como atualização parcial", () => {
  const res = parseReadEarnUpdate({});
  assert.deepEqual(res, {});
});

test("readEarnAdminUpdateSchema: atualizações de campos válidos passam", () => {
  const res = parseReadEarnUpdate({
    title: "Novo Título",
    rewardAmount: 25.5,
    isActive: false,
    rewardCode: "NEWCODE2026",
  });

  assert.equal(res.title, "Novo Título");
  assert.equal(res.rewardAmount, 25.5);
  assert.equal(res.isActive, false);
  assert.equal(res.rewardCode, "NEWCODE2026");
});

test("readEarnAdminUpdateSchema: rejeita se ambas as datas fornecidas violarem expiresAt > startsAt", () => {
  const now = new Date();
  const past = new Date(now.getTime() - 1000);

  assert.throws(
    () =>
      parseReadEarnUpdate({
        startsAt: now.toISOString(),
        expiresAt: past.toISOString(),
      }),
    ZodError,
  );
});

// ─── readEarnRedeemBodySchema ─────────────────────────────────────────────────

test("readEarnRedeemBodySchema: payload válido de resgate", () => {
  const res = parseReadEarnRedeem({
    campaignId: "5", // coerce string to number
    code: "SECRET_CODE_123",
  });

  assert.equal(res.campaignId, 5);
  assert.equal(res.code, "SECRET_CODE_123");
});

test("readEarnRedeemBodySchema: rejeita campaignId inválido ou negativo", () => {
  assert.throws(() => parseReadEarnRedeem({ campaignId: -1, code: "ABC" }), ZodError);
  assert.throws(() => parseReadEarnRedeem({ campaignId: 0, code: "ABC" }), ZodError);
  assert.throws(() => parseReadEarnRedeem({ campaignId: "abc", code: "ABC" }), ZodError);
});

test("readEarnRedeemBodySchema: rejeita código vazio", () => {
  assert.throws(() => parseReadEarnRedeem({ campaignId: 1, code: "" }), ZodError);
});
