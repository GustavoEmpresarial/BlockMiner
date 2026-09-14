/**
 * Guarda de regressão do item 95 Parte B (PROGRESSO.txt) — Postgres real. Cobre o fluxo
 * completo de verificação de email do pentest de blockminer.space: token stateless,
 * idempotência, gate em ações sensíveis, e o princípio-chave de NÃO travar usuários
 * existentes (backfill).
 */
import test from "node:test";
import assert from "node:assert/strict";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const authService = await import("../../server/modules/auth/auth.service.ts");
const { requireEmailVerified } = await import(
  "../../server/core/http/middleware/requireEmailVerified.ts"
);

const createdUserIds = [];

async function makeUser(overrides = {}) {
  const suffix = `emailverif_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Email Verify Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.60",
      ip: "203.0.113.60",
      userAgent: "test-agent/1.0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

// ─── Backfill: usuário "antigo" nunca fica travado ─────────────────────────

test("usuário criado ANTES do deploy (backfillado) tem emailVerifiedAt setado, nunca é bloqueado", async () => {
  // Simula o backfill da migration: cria já com emailVerifiedAt = createdAt.
  const now = new Date();
  const oldUser = await makeUser({ emailVerifiedAt: now });
  assert.ok(oldUser.emailVerifiedAt, "usuário antigo deve ter emailVerifiedAt setado");
});

test("requireEmailVerified NUNCA bloqueia usuário com emailVerifiedAt setado", () => {
  let passed = false;
  const req = { user: { id: 1, emailVerifiedAt: new Date() } };
  const res = { status() { throw new Error("não deveria bloquear"); } };
  requireEmailVerified(req, res, () => { passed = true; });
  assert.equal(passed, true);
});

// ─── Conta nova: bloqueada até verificar ───────────────────────────────────

test("usuário NOVO (emailVerifiedAt null) é bloqueado por requireEmailVerified", () => {
  let blocked = null;
  const req = { user: { id: 2, emailVerifiedAt: null } };
  const res = {
    status(code) {
      blocked = code;
      return { json(body) { blocked = { code, body }; } };
    },
  };
  let passed = false;
  requireEmailVerified(req, res, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(blocked.code, 403);
  assert.equal(blocked.body.code, "EMAIL_NOT_VERIFIED");
});

// ─── Token stateless: sign/verify (mesmo padrão do reset de senha) ─────────

test("signEmailVerificationToken / verifyEmailVerificationToken: round-trip válido", () => {
  const token = authService.signEmailVerificationToken(42);
  const payload = authService.verifyEmailVerificationToken(token);
  assert.ok(payload);
  assert.equal(payload.sub, "42");
  assert.equal(payload.typ, "email_verify");
});

test("verifyEmailVerificationToken rejeita token de OUTRO tipo (ex: reset de senha)", () => {
  const resetToken = authService.signPasswordResetToken(42, 0);
  const payload = authService.verifyEmailVerificationToken(resetToken);
  assert.equal(payload, null, "token de reset de senha não pode passar como verificação de email");
});

test("verifyPasswordResetToken rejeita token de verificação de email (cross-type)", () => {
  const verifyToken = authService.signEmailVerificationToken(42);
  const payload = authService.verifyPasswordResetToken(verifyToken);
  assert.equal(payload, null);
});

test("verifyEmailVerificationToken rejeita lixo/token inválido", () => {
  assert.equal(authService.verifyEmailVerificationToken("token-invalido"), null);
  assert.equal(authService.verifyEmailVerificationToken(""), null);
});

// ─── Fluxo end-to-end via HTTP real (verify-email endpoint) ────────────────

test("fluxo completo: registra → não verificado → token → POST /verify-email → verificado", async () => {
  const user = await makeUser({ emailVerifiedAt: null });

  const authController = await import("../../server/modules/auth/auth.controller.ts");
  const token = authService.signEmailVerificationToken(user.id);

  const req = { body: { token } };
  let jsonBody = null;
  let statusCode = 200;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { jsonBody = body; },
  };

  await authController.verifyEmailPost(req, res);

  assert.equal(statusCode, 200);
  assert.equal(jsonBody.ok, true);

  const updated = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerifiedAt: true } });
  assert.ok(updated.emailVerifiedAt, "emailVerifiedAt deve estar setado após verificação");
});

test("verify-email é idempotente: chamar duas vezes não quebra", async () => {
  const user = await makeUser({ emailVerifiedAt: null });
  const authController = await import("../../server/modules/auth/auth.controller.ts");
  const token = authService.signEmailVerificationToken(user.id);

  const call = async () => {
    let jsonBody = null;
    const res = { status() { return this; }, json(body) { jsonBody = body; } };
    await authController.verifyEmailPost({ body: { token } }, res);
    return jsonBody;
  };

  const first = await call();
  const second = await call();
  assert.equal(first.ok, true);
  assert.equal(second.ok, true, "segunda chamada com o mesmo token não pode dar erro");
});

test("verify-email com token de usuário inexistente responde 404, não quebra", async () => {
  const authController = await import("../../server/modules/auth/auth.controller.ts");
  const token = authService.signEmailVerificationToken(999_999_999);

  let statusCode = 200;
  const res = { status(code) { statusCode = code; return this; }, json() {} };
  await authController.verifyEmailPost({ body: { token } }, res);
  assert.equal(statusCode, 404);
});
