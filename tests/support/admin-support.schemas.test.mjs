import test from "node:test";
import assert from "node:assert/strict";

const schemas = await import("../../server/modules/support/support.schemas.ts");

// ─── supportTicketIdParamSchema ──────────────────────────────────────────────

test("supportTicketIdParamSchema: accepts valid integer id", () => {
  const result = schemas.supportTicketIdParamSchema.safeParse({ id: "10" });
  assert.equal(result.success, true);
  assert.equal(result.data.id, 10);
});

test("supportTicketIdParamSchema: rejects negative id", () => {
  const result = schemas.supportTicketIdParamSchema.safeParse({ id: "-5" });
  assert.equal(result.success, false);
});

test("supportTicketIdParamSchema: rejects zero id", () => {
  const result = schemas.supportTicketIdParamSchema.safeParse({ id: "0" });
  assert.equal(result.success, false);
});

test("supportTicketIdParamSchema: rejects float id", () => {
  const result = schemas.supportTicketIdParamSchema.safeParse({ id: "12.34" });
  assert.equal(result.success, false);
});

test("supportTicketIdParamSchema: rejects 32-bit overflow id", () => {
  const result = schemas.supportTicketIdParamSchema.safeParse({ id: "2147483648" });
  assert.equal(result.success, false);
});

test("supportTicketIdParamSchema: rejects non-numeric id", () => {
  const result = schemas.supportTicketIdParamSchema.safeParse({ id: "ticket-abc" });
  assert.equal(result.success, false);
});

test("supportTicketIdParamSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.supportTicketIdParamSchema.safeParse({ id: "1", isAdmin: true, role: "super_admin" });
  assert.equal(result.success, false);
});

// ─── adminSupportListQuerySchema ─────────────────────────────────────────────

test("adminSupportListQuerySchema: applies defaults when empty", () => {
  const result = schemas.adminSupportListQuerySchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.page, 1);
  assert.equal(result.data.limit, 50);
  assert.equal(result.data.userId, null);
  assert.equal(result.data.archived, false);
});

test("adminSupportListQuerySchema: accepts valid page, limit and userId", () => {
  const result = schemas.adminSupportListQuerySchema.safeParse({
    page: "3",
    limit: "25",
    userId: "42",
    archived: "1",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.page, 3);
  assert.equal(result.data.limit, 25);
  assert.equal(result.data.userId, 42);
  assert.equal(result.data.archived, true);
});

test("adminSupportListQuerySchema: accepts true boolean for archived", () => {
  const result = schemas.adminSupportListQuerySchema.safeParse({ archived: true });
  assert.equal(result.success, true);
  assert.equal(result.data.archived, true);
});

test("adminSupportListQuerySchema: rejects limit exceeding 100", () => {
  const result = schemas.adminSupportListQuerySchema.safeParse({ limit: "500" });
  assert.equal(result.success, false);
});

test("adminSupportListQuerySchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminSupportListQuerySchema.safeParse({ page: 1, hacker: "exploit" });
  assert.equal(result.success, false);
});

// ─── adminSupportArchiveSchema ───────────────────────────────────────────────

test("adminSupportArchiveSchema: accepts valid archived boolean true", () => {
  const result = schemas.adminSupportArchiveSchema.safeParse({ archived: true });
  assert.equal(result.success, true);
  assert.equal(result.data.archived, true);
});

test("adminSupportArchiveSchema: accepts valid archived boolean false", () => {
  const result = schemas.adminSupportArchiveSchema.safeParse({ archived: false });
  assert.equal(result.success, true);
  assert.equal(result.data.archived, false);
});

test("adminSupportArchiveSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminSupportArchiveSchema.safeParse({ archived: true, deleteData: true });
  assert.equal(result.success, false);
});

// ─── creditPolSchema ─────────────────────────────────────────────────────────

test("creditPolSchema: accepts valid amount number and reason", () => {
  const result = schemas.creditPolSchema.safeParse({
    amount: 5.5,
    reason: "Compensação por lentidão de rede",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.amount, 5.5);
  assert.equal(result.data.reason, "Compensação por lentidão de rede");
});

test("creditPolSchema: accepts valid amount as string with comma or dot", () => {
  const result = schemas.creditPolSchema.safeParse({
    amount: "10,25",
    reason: "Bônus de fidelidade",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.amount, 10.25);
});

test("creditPolSchema: rejects zero or negative amount", () => {
  const zeroRes = schemas.creditPolSchema.safeParse({ amount: 0, reason: "Teste zero" });
  assert.equal(zeroRes.success, false);

  const negRes = schemas.creditPolSchema.safeParse({ amount: -10, reason: "Teste negativo" });
  assert.equal(negRes.success, false);
});

test("creditPolSchema: rejects amount exceeding 1000 POL safety cap", () => {
  const result = schemas.creditPolSchema.safeParse({
    amount: 1000.01,
    reason: "Valor muito alto",
  });
  assert.equal(result.success, false);
});

test("creditPolSchema: rejects reason shorter than 3 characters", () => {
  const result = schemas.creditPolSchema.safeParse({
    amount: 1,
    reason: "ok",
  });
  assert.equal(result.success, false);
});

test("creditPolSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.creditPolSchema.safeParse({
    amount: 1,
    reason: "Motivo valido",
    directWithdraw: true,
  });
  assert.equal(result.success, false);
});

// ─── adminReplySchema ────────────────────────────────────────────────────────

test("adminReplySchema: accepts valid reply text", () => {
  const result = schemas.adminReplySchema.safeParse({
    reply: "Sua solicitação foi atendida com sucesso.",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.reply, "Sua solicitação foi atendida com sucesso.");
});

test("adminReplySchema: accepts valid message alias text", () => {
  const result = schemas.adminReplySchema.safeParse({
    message: "Verificamos o seu extrato e corrigimos o saldo.",
  });
  assert.equal(result.success, true);
});

test("adminReplySchema: accepts attachments with valid url", () => {
  const result = schemas.adminReplySchema.safeParse({
    reply: "Veja o anexo explicativo.",
    attachments: [
      { url: "/uploads/support/receipt.png", mimeType: "image/png" },
    ],
  });
  assert.equal(result.success, true);
  assert.equal(result.data.attachments.length, 1);
});

test("adminReplySchema: rejects empty reply and message", () => {
  const result = schemas.adminReplySchema.safeParse({});
  assert.equal(result.success, false);
});

test("adminReplySchema: rejects more than 5 attachments", () => {
  const attachments = Array.from({ length: 6 }, (_, i) => ({
    url: `/uploads/support/img${i}.png`,
  }));
  const result = schemas.adminReplySchema.safeParse({
    reply: "Muitos anexos",
    attachments,
  });
  assert.equal(result.success, false);
});

test("adminReplySchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminReplySchema.safeParse({
    reply: "Texto",
    isBot: false,
  });
  assert.equal(result.success, false);
});

// ─── adminSupportDossierQuerySchema ──────────────────────────────────────────

test("adminSupportDossierQuerySchema: applies defaults when empty", () => {
  const result = schemas.adminSupportDossierQuerySchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.limit, 30);
  assert.equal(result.data.depositsPage, 1);
  assert.equal(result.data.withdrawalsPage, 1);
});

test("adminSupportDossierQuerySchema: accepts custom page slices", () => {
  const result = schemas.adminSupportDossierQuerySchema.safeParse({
    limit: "50",
    depositsPage: "2",
    ccpaymentPage: "3",
    withdrawalsPage: "4",
    payoutsPage: "5",
    minersPage: "6",
    inventoryPage: "7",
    vaultPage: "8",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.limit, 50);
  assert.equal(result.data.minersPage, 6);
  assert.equal(result.data.vaultPage, 8);
});

test("adminSupportDossierQuerySchema: rejects limit out of bounds (< 10 or > 80)", () => {
  const low = schemas.adminSupportDossierQuerySchema.safeParse({ limit: "5" });
  assert.equal(low.success, false);

  const high = schemas.adminSupportDossierQuerySchema.safeParse({ limit: "150" });
  assert.equal(high.success, false);
});

test("adminSupportDossierQuerySchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminSupportDossierQuerySchema.safeParse({
    limit: 30,
    sqlInjection: "' OR 1=1 --",
  });
  assert.equal(result.success, false);
});
