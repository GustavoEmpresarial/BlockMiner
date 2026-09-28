import test from "node:test";
import assert from "node:assert/strict";

const { getMiniPassSeasonState, isMiniPassSeasonVisible, isMiniPassSeasonLive } = await import(
  "../../server/modules/mini-pass/mini-pass.season-live.ts"
);
const { resolveMissionPeriodKey } = await import(
  "../../server/modules/mini-pass/mini-pass.period.ts"
);
const { pickMiniPassI18n } = await import(
  "../../server/modules/mini-pass/mini-pass.i18n.ts"
);

// ─── 1. Estados da Temporada (getMiniPassSeasonState) ────────────────────────

test("getMiniPassSeasonState: temporada inativa ou deletada é hidden", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  assert.equal(getMiniPassSeasonState(null, now), "hidden");
  assert.equal(getMiniPassSeasonState({ isActive: false, startsAt: now, endsAt: now }, now), "hidden");
  assert.equal(getMiniPassSeasonState({ isActive: true, deletedAt: new Date(), startsAt: now, endsAt: now }, now), "hidden");
});

test("getMiniPassSeasonState: temporada antes do início é upcoming", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const season = {
    startsAt: new Date("2026-09-28T00:00:00Z"),
    endsAt: new Date("2026-10-28T00:00:00Z"),
    isActive: true,
  };
  assert.equal(getMiniPassSeasonState(season, now), "upcoming");
  assert.equal(isMiniPassSeasonVisible(season, now), true);
  assert.equal(isMiniPassSeasonLive(season, now), false);
});

test("getMiniPassSeasonState: temporada no intervalo é live", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const season = {
    startsAt: new Date("2026-09-28T00:00:00Z"),
    endsAt: new Date("2026-10-28T00:00:00Z"),
    isActive: true,
  };
  assert.equal(getMiniPassSeasonState(season, now), "live");
  assert.equal(isMiniPassSeasonVisible(season, now), true);
  assert.equal(isMiniPassSeasonLive(season, now), true);
});

test("getMiniPassSeasonState: temporada após o fim é ended", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const season = {
    startsAt: new Date("2026-09-28T00:00:00Z"),
    endsAt: new Date("2026-10-28T00:00:00Z"),
    isActive: true,
  };
  assert.equal(getMiniPassSeasonState(season, now), "ended");
  assert.equal(isMiniPassSeasonVisible(season, now), false);
  assert.equal(isMiniPassSeasonLive(season, now), false);
});

// ─── 2. Resolução de Chaves de Período (resolveMissionPeriodKey) ──────────────

test("resolveMissionPeriodKey: cadência EVENT retorna chave estática", () => {
  const now = new Date("2026-09-28T15:30:00Z");
  assert.equal(resolveMissionPeriodKey("EVENT", "PLAY_GAMES", now), "__EVENT__");
});

test("resolveMissionPeriodKey: cadência DAILY retorna data em UTC (YYYY-MM-DD)", () => {
  const now = new Date("2026-09-28T15:30:00Z");
  assert.equal(resolveMissionPeriodKey("DAILY", "LOGIN_DAY", now), "2026-09-28");
});

test("resolveMissionPeriodKey: cadência WEEKLY retorna semana ISO UTC", () => {
  const now = new Date("2026-09-28T15:30:00Z");
  const key = resolveMissionPeriodKey("WEEKLY", "MINE_BLK", now);
  assert.ok(key.startsWith("2026-W"));
});

// ─── 3. I18n de Textos Multilíngues (pickMiniPassI18n) ───────────────────────

test("pickMiniPassI18n: seleciona idioma preferido com base no accept-language", () => {
  const texts = { en: "Season 1", ptBR: "Temporada 1", es: "Temporada 1 ES" };
  assert.equal(pickMiniPassI18n(texts, "pt-BR,pt;q=0.9"), "Temporada 1");
  assert.equal(pickMiniPassI18n(texts, "es-ES,es;q=0.9"), "Temporada 1 ES");
  assert.equal(pickMiniPassI18n(texts, "en-US,en;q=0.9"), "Season 1");
});

test("pickMiniPassI18n: faz fallback para en ou primeiro disponível se idioma não existir", () => {
  const texts = { en: "Season English" };
  assert.equal(pickMiniPassI18n(texts, "de-DE"), "Season English");
});
