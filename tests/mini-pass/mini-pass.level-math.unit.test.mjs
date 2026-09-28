import test from "node:test";
import assert from "node:assert/strict";

const { computePassLevel, xpCapForSeason, xpRemainingToCap } = await import(
  "../../server/modules/mini-pass/mini-pass.level-math.ts"
);

// ─── 1. Cálculo de Nível (computePassLevel) ──────────────────────────────────

test("computePassLevel: 0 XP inicia no nível 1", () => {
  assert.equal(computePassLevel(0, 100, 10), 1);
  assert.equal(computePassLevel(50, 100, 10), 1);
  assert.equal(computePassLevel(99, 100, 10), 1);
});

test("computePassLevel: alcança nível 2 com 100 XP e nível 3 com 200 XP", () => {
  assert.equal(computePassLevel(100, 100, 10), 2);
  assert.equal(computePassLevel(150, 100, 10), 2);
  assert.equal(computePassLevel(200, 100, 10), 3);
});

test("computePassLevel: respeita o maxLevel e não ultrapassa", () => {
  assert.equal(computePassLevel(900, 100, 10), 10);
  assert.equal(computePassLevel(1000, 100, 10), 10);
  assert.equal(computePassLevel(99999, 100, 10), 10);
});

test("computePassLevel: lida com valores inválidos ou negativos com segurança", () => {
  assert.equal(computePassLevel(-50, 100, 10), 1);
  assert.equal(computePassLevel(NaN, 100, 10), 1);
  assert.equal(computePassLevel(0, 0, 10), 1);
});

// ─── 2. Teto de XP da Temporada (xpCapForSeason) ─────────────────────────────

test("xpCapForSeason: calcula (maxLevel - 1) * xpPerLevel", () => {
  assert.equal(xpCapForSeason(10, 100), 900);
  assert.equal(xpCapForSeason(50, 200), 9800);
});

test("xpCapForSeason: valores menores que 1 são normalizados para 0", () => {
  assert.equal(xpCapForSeason(0, 100), 0);
  assert.equal(xpCapForSeason(10, 0), 9);
});

// ─── 3. XP Restante até o Teto (xpRemainingToCap) ────────────────────────────

test("xpRemainingToCap: calcula corretamente o XP restante até completar o passe", () => {
  assert.equal(xpRemainingToCap(0, 10, 100), 900);
  assert.equal(xpRemainingToCap(350, 10, 100), 550);
  assert.equal(xpRemainingToCap(900, 10, 100), 0);
  assert.equal(xpRemainingToCap(1500, 10, 100), 0); // Nunca retorna negativo
});
