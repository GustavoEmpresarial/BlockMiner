import test from "node:test";
import assert from "node:assert/strict";

const { adminFaucetConfigUpdateSchema } = await import(
  "../../server/modules/faucet/faucet.admin.schemas.ts"
);

test("adminFaucetConfigUpdateSchema: aceita payload completo e válido", () => {
  const result = adminFaucetConfigUpdateSchema.safeParse({
    name: "Pulse Mini v2",
    baseHashRate: 45,
    imageUrl: "/media/miners/reward2.webp",
    cooldownMs: 3600000,
    isActive: true,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Pulse Mini v2");
    assert.equal(result.data.baseHashRate, 45);
    assert.equal(result.data.imageUrl, "/media/miners/reward2.webp");
    assert.equal(result.data.cooldownMs, 3600000);
    assert.equal(result.data.isActive, true);
  }
});

test("adminFaucetConfigUpdateSchema: aceita atualização parcial válida", () => {
  const result = adminFaucetConfigUpdateSchema.safeParse({
    baseHashRate: 50,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.baseHashRate, 50);
    assert.equal(result.data.name, undefined);
  }
});

test("adminFaucetConfigUpdateSchema: rejeita payload vazio (ao menos um campo requerido)", () => {
  const result = adminFaucetConfigUpdateSchema.safeParse({});
  assert.equal(result.success, false);
});

test("adminFaucetConfigUpdateSchema: rejeita nome vazio ou com apenas espaços", () => {
  const result = adminFaucetConfigUpdateSchema.safeParse({ name: "   " });
  assert.equal(result.success, false);
});

test("adminFaucetConfigUpdateSchema: rejeita hashrate menor ou igual a zero", () => {
  const resultZero = adminFaucetConfigUpdateSchema.safeParse({ baseHashRate: 0 });
  assert.equal(resultZero.success, false);

  const resultNeg = adminFaucetConfigUpdateSchema.safeParse({ baseHashRate: -10 });
  assert.equal(resultNeg.success, false);
});

test("adminFaucetConfigUpdateSchema: rejeita hashrate não-finito (NaN ou Infinity)", () => {
  const resultNaN = adminFaucetConfigUpdateSchema.safeParse({ baseHashRate: NaN });
  assert.equal(resultNaN.success, false);

  const resultInf = adminFaucetConfigUpdateSchema.safeParse({ baseHashRate: Infinity });
  assert.equal(resultInf.success, false);
});

test("adminFaucetConfigUpdateSchema: rejeita hashrate que excede 1.000.000 H/s", () => {
  const result = adminFaucetConfigUpdateSchema.safeParse({ baseHashRate: 1000001 });
  assert.equal(result.success, false);
});

test("adminFaucetConfigUpdateSchema: bloqueia URIs perigosas (XSS / javascript / data:)", () => {
  const dangerousUrls = [
    "javascript:alert(1)",
    "JAVASCRIPT:prompt(document.domain)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ];

  for (const url of dangerousUrls) {
    const result = adminFaucetConfigUpdateSchema.safeParse({ imageUrl: url });
    assert.equal(result.success, false, `Deveria ter rejeitado URL perigosa: ${url}`);
  }
});

test("adminFaucetConfigUpdateSchema: aceita URLs relativas e absolutas seguras", () => {
  const safeUrls = [
    "/media/miners/miner-1.webp",
    "/media/reward.png",
    "https://blockminer.space/media/reward.webp",
    "http://localhost:3000/media/test.png",
  ];

  for (const url of safeUrls) {
    const result = adminFaucetConfigUpdateSchema.safeParse({ imageUrl: url });
    assert.equal(result.success, true, `Deveria ter aceitado URL segura: ${url}`);
  }
});

test("adminFaucetConfigUpdateSchema: converte string vazia em imageUrl para null", () => {
  const result = adminFaucetConfigUpdateSchema.safeParse({ imageUrl: "" });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.imageUrl, null);
  }
});

test("adminFaucetConfigUpdateSchema: rejeita cooldown menor que 1 minuto (60.000 ms)", () => {
  const result = adminFaucetConfigUpdateSchema.safeParse({ cooldownMs: 59999 });
  assert.equal(result.success, false);
});

test("adminFaucetConfigUpdateSchema: rejeita cooldown maior que 7 dias (604.800.000 ms)", () => {
  const result = adminFaucetConfigUpdateSchema.safeParse({ cooldownMs: 604800001 });
  assert.equal(result.success, false);
});

test("adminFaucetConfigUpdateSchema: rejeita cooldown não inteiro", () => {
  const result = adminFaucetConfigUpdateSchema.safeParse({ cooldownMs: 3600000.5 });
  assert.equal(result.success, false);
});
