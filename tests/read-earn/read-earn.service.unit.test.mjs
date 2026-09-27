import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";

const {
  isReadEarnCampaignLive,
  hashReadEarnCode,
  redeemReadEarnCampaign,
} = await import("../../server/modules/read-earn/read-earn.service.ts");

const { REDEEM_GENERIC } = await import("../../server/modules/read-earn/read-earn.errors.ts");
const { BCRYPT_COST } = await import("../../server/shared/security/password.ts");

// ─── isReadEarnCampaignLive ──────────────────────────────────────────────────

test("isReadEarnCampaignLive: retorna true para campanha ativa dentro da janela", () => {
  const now = new Date("2026-05-15T12:00:00Z");
  const campaign = {
    isActive: true,
    startsAt: new Date("2026-05-01T00:00:00Z"),
    expiresAt: new Date("2026-05-31T23:59:59Z"),
  };

  assert.equal(isReadEarnCampaignLive(campaign, now), true);
});

test("isReadEarnCampaignLive: retorna false se isActive for false", () => {
  const now = new Date("2026-05-15T12:00:00Z");
  const campaign = {
    isActive: false,
    startsAt: new Date("2026-05-01T00:00:00Z"),
    expiresAt: new Date("2026-05-31T23:59:59Z"),
  };

  assert.equal(isReadEarnCampaignLive(campaign, now), false);
});

test("isReadEarnCampaignLive: retorna false se now for anterior a startsAt", () => {
  const now = new Date("2026-04-30T23:59:59Z");
  const campaign = {
    isActive: true,
    startsAt: new Date("2026-05-01T00:00:00Z"),
    expiresAt: new Date("2026-05-31T23:59:59Z"),
  };

  assert.equal(isReadEarnCampaignLive(campaign, now), false);
});

test("isReadEarnCampaignLive: retorna false se now for posterior a expiresAt", () => {
  const now = new Date("2026-06-01T00:00:01Z");
  const campaign = {
    isActive: true,
    startsAt: new Date("2026-05-01T00:00:00Z"),
    expiresAt: new Date("2026-05-31T23:59:59Z"),
  };

  assert.equal(isReadEarnCampaignLive(campaign, now), false);
});

test("isReadEarnCampaignLive: aceita datas em formato ISO string", () => {
  const now = new Date("2026-05-15T12:00:00Z");
  const campaign = {
    isActive: true,
    startsAt: "2026-05-01T00:00:00Z",
    expiresAt: "2026-05-31T23:59:59Z",
  };

  assert.equal(isReadEarnCampaignLive(campaign, now), true);
});

test("isReadEarnCampaignLive: lida com null ou undefined com segurança", () => {
  assert.equal(isReadEarnCampaignLive(null), false);
  assert.equal(isReadEarnCampaignLive(undefined), false);
});

// ─── hashReadEarnCode ────────────────────────────────────────────────────────

test("hashReadEarnCode: gera hash bcrypt válido com work factor 12", async () => {
  const plain = "PROMO_CODE_2026";
  const hash = await hashReadEarnCode(plain);

  assert.equal(typeof hash, "string");
  // O prefixo do bcrypt identifica o algoritmo e o custo: $2a$12$... ou $2b$12$...
  const parts = hash.split("$");
  assert.equal(parts[2], String(BCRYPT_COST)); // cost = 12

  // bcrypt.compare deve validar com sucesso
  const match = await bcrypt.compare(plain, hash);
  assert.equal(match, true);

  // bcrypt.compare com código incorreto deve falhar
  const wrongMatch = await bcrypt.compare("WRONG_CODE", hash);
  assert.equal(wrongMatch, false);
});

test("hashReadEarnCode: aplica trim em espaços em branco nas pontas", async () => {
  const hash = await hashReadEarnCode("   UNTRIMMED_CODE   ");
  const match = await bcrypt.compare("UNTRIMMED_CODE", hash);
  assert.equal(match, true);
});

// ─── redeemReadEarnCampaign: Validações Pré-Transação ─────────────────────────

test("redeemReadEarnCampaign: rejeita código vazio ou somente espaços sem abrir transação", async () => {
  const res1 = await redeemReadEarnCampaign({ userId: 1, campaignId: 1, rawCode: "" });
  assert.equal(res1.ok, false);
  assert.equal(res1.code, REDEEM_GENERIC);

  const res2 = await redeemReadEarnCampaign({ userId: 1, campaignId: 1, rawCode: "    " });
  assert.equal(res2.ok, false);
  assert.equal(res2.code, REDEEM_GENERIC);
});

test("redeemReadEarnCampaign: rejeita código com comprimento excessivo (> 128 chars)", async () => {
  const longCode = "x".repeat(129);
  const res = await redeemReadEarnCampaign({ userId: 1, campaignId: 1, rawCode: longCode });
  assert.equal(res.ok, false);
  assert.equal(res.code, REDEEM_GENERIC);
});
