import test from "node:test";
import assert from "node:assert/strict";

const service = await import("../../server/modules/internal-offerwall/internal-offerwall.service.ts");
const { INTERNAL_OFFERWALL_ERROR } = await import(
  "../../server/modules/internal-offerwall/internal-offerwall.errors.ts"
);
const {
  OFFER_KIND_PTC_IFRAME,
  OFFER_KIND_GENERAL_TASK,
  RESET_TYPE_DAILY,
  RESET_TYPE_COOLDOWN,
} = await import("../../server/modules/internal-offerwall/internal-offerwall.config.ts");

// ─── 1. Cálculos de Período e Resets UTC ─────────────────────────────────────

test("getInternalOfferwallPeriodKey: retorna formato YYYY-MM-DD em UTC", () => {
  const d = new Date("2026-09-28T14:30:00Z");
  assert.equal(service.getInternalOfferwallPeriodKey(d), "2026-09-28");
});

test("getNextInternalOfferwallResetAt: calcula 00:00:00Z do dia seguinte", () => {
  const d = new Date("2026-09-28T14:30:00Z");
  const next = service.getNextInternalOfferwallResetAt(d);
  assert.equal(next.toISOString(), "2026-09-29T00:00:00.000Z");
});

test("msUntilInternalOfferwallReset: calcula milissegundos restantes até meia-noite UTC", () => {
  const d = new Date("2026-09-28T23:59:50Z");
  const ms = service.msUntilInternalOfferwallReset(d);
  assert.equal(ms, 10_000);
});

test("countDailyCompletions: filtra apenas tentativas completadas no mesmo período UTC", () => {
  const rows = [
    { periodKey: "2026-09-28", completedAt: new Date("2026-09-28T10:00:00Z") },
    { periodKey: "2026-09-28", completedAt: new Date("2026-09-28T18:00:00Z") },
    { periodKey: "2026-09-27", completedAt: new Date("2026-09-27T22:00:00Z") },
  ];
  const countToday = service.countDailyCompletions(rows, "2026-09-28", RESET_TYPE_DAILY);
  assert.equal(countToday, 2);

  const countYesterday = service.countDailyCompletions(rows, "2026-09-27", RESET_TYPE_DAILY);
  assert.equal(countYesterday, 1);
});

// ─── 2. Validação de Tempo Mínimo (assertMinViewForSubmit) ───────────────────

test("assertMinViewForSubmit: PTC falha se partnerOpenedAt for nulo", () => {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 60_000);
  const res = service.assertMinViewForSubmit({
    offerKind: OFFER_KIND_PTC_IFRAME,
    startedAt,
    partnerOpenedAt: null,
    now,
    minViewSeconds: 15,
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, INTERNAL_OFFERWALL_ERROR.PARTNER_NOT_OPENED);
});

test("assertMinViewForSubmit: PTC falha se tempo decorrido desde partnerOpenedAt for menor que minViewSeconds", () => {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 60_000);
  const partnerOpenedAt = new Date(now.getTime() - 5_000); // 5 segundos atrás
  const res = service.assertMinViewForSubmit({
    offerKind: OFFER_KIND_PTC_IFRAME,
    startedAt,
    partnerOpenedAt,
    now,
    minViewSeconds: 15,
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, INTERNAL_OFFERWALL_ERROR.MIN_VIEW_NOT_MET);
});

test("assertMinViewForSubmit: PTC é aprovado quando elapsed >= minViewSeconds", () => {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 60_000);
  const partnerOpenedAt = new Date(now.getTime() - 20_000); // 20 segundos atrás
  const res = service.assertMinViewForSubmit({
    offerKind: OFFER_KIND_PTC_IFRAME,
    startedAt,
    partnerOpenedAt,
    now,
    minViewSeconds: 15,
  });
  assert.equal(res.ok, true);
});

test("assertMinViewForSubmit: GENERAL_TASK mede tempo a partir de startedAt", () => {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 30_000);
  const res = service.assertMinViewForSubmit({
    offerKind: OFFER_KIND_GENERAL_TASK,
    startedAt,
    partnerOpenedAt: null,
    now,
    minViewSeconds: 20,
  });
  assert.equal(res.ok, true);
});

// ─── 3. Limites e Snapshots de Uso (computeUsageSnapshot) ────────────────────

test("computeUsageSnapshot: limite diário respeita maxPerPeriod e calcula tempo restante", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const periodKey = "2026-09-28";
  const completionRows = [
    { periodKey, completedAt: new Date("2026-09-28T08:00:00Z") },
    { periodKey, completedAt: new Date("2026-09-28T09:00:00Z") },
    { periodKey, completedAt: new Date("2026-09-28T10:00:00Z") },
  ];

  const snap = service.computeUsageSnapshot({
    resetType: RESET_TYPE_DAILY,
    maxPerPeriod: 3,
    cooldownWindowSec: null,
    completionRows,
    periodKey,
    now,
    hasOpenAttempt: false,
  });

  assert.equal(snap.completedCount, 3);
  assert.equal(snap.canStartNew, false);
  assert.ok(snap.secondsUntilAvailable > 0);
});

test("computeUsageSnapshot: limite por cooldown calcula janela deslizante corretamente", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const periodKey = "2026-09-28";
  // 1 conclusão recente (30 minutos atrás) com cooldown de 1 hora (3600s)
  const completionRows = [
    { periodKey, completedAt: new Date("2026-09-28T11:30:00Z") },
  ];

  const snap = service.computeUsageSnapshot({
    resetType: RESET_TYPE_COOLDOWN,
    maxPerPeriod: 1,
    cooldownWindowSec: 3600,
    completionRows,
    periodKey,
    now,
    hasOpenAttempt: false,
  });

  assert.equal(snap.completedCount, 1);
  assert.equal(snap.canStartNew, false);
  // Restam ~30 minutos (1800s)
  assert.ok(snap.secondsUntilAvailable >= 1700 && snap.secondsUntilAvailable <= 1800);
});

// ─── 4. Normalização de Metadados de Tarefas (normalizeTaskMetadata) ──────────

test("normalizeTaskMetadata: valida e sanitiza países ISO 3166-1 alpha-2", () => {
  const meta = {
    targetCountryCodes: ["br", "US", "de"],
    requiredActions: ["Cadastrar no app", "Confirmar e-mail"],
    resetType: "DAILY",
  };
  const res = service.normalizeTaskMetadata(OFFER_KIND_GENERAL_TASK, meta);
  assert.equal(res.ok, true);
  assert.deepEqual(res.value.targetCountryCodes, ["BR", "US", "DE"]);
  assert.deepEqual(res.value.requiredActions, ["Cadastrar no app", "Confirmar e-mail"]);
  assert.equal(res.value.resetType, "DAILY");
});

test("normalizeTaskMetadata: rejeita países que não estejam no formato alpha-2 de 2 letras", () => {
  const meta = { targetCountryCodes: ["BRA", "12"] };
  const res = service.normalizeTaskMetadata(OFFER_KIND_GENERAL_TASK, meta);
  assert.equal(res.ok, false);
  assert.ok(res.message.includes("alpha-2"));
});
