import test from "node:test";
import assert from "node:assert/strict";

const {
  createTournamentSchema,
  updateTournamentSchema,
  tournamentIdParamSchema,
  updateDisplayOrderSchema,
  prizeInputSchema,
} = await import("../../server/modules/tournaments/tournaments.schemas.ts");

test("Unit: createTournamentSchema accepts a well-formed tournament payload", () => {
  const payload = {
    name: "Torneio Diário de Teste",
    description: "Descrição válida para teste unitário",
    type: "DAILY",
    metric: "BLOCKS_MINED",
    startsAt: "2026-09-25T00:00:00.000Z",
    endsAt: "2026-09-26T00:00:00.000Z",
    recurring: true,
    prizes: [
      {
        rankFrom: 1,
        rankTo: 1,
        prizeType: "POL",
        polAmount: 50,
      },
      {
        rankFrom: 2,
        rankTo: 5,
        prizeType: "BLK",
        blkAmount: 200,
      },
    ],
  };

  const parsed = createTournamentSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.name, "Torneio Diário de Teste");
    assert.equal(parsed.data.type, "DAILY");
    assert.equal(parsed.data.metric, "BLOCKS_MINED");
    assert.equal(parsed.data.prizes.length, 2);
  }
});

test("Unit: createTournamentSchema rejects missing required fields", () => {
  assert.equal(createTournamentSchema.safeParse({}).success, false);
  assert.equal(createTournamentSchema.safeParse({ name: "   " }).success, false);
});

test("Unit: createTournamentSchema rejects invalid type enum", () => {
  const res = createTournamentSchema.safeParse({
    name: "Invalid Type",
    type: "HOURLY",
    metric: "BLOCKS_MINED",
    startsAt: "2026-09-25T00:00:00.000Z",
    endsAt: "2026-09-26T00:00:00.000Z",
  });
  assert.equal(res.success, false);
});

test("Unit: createTournamentSchema rejects invalid metric", () => {
  const res = createTournamentSchema.safeParse({
    name: "Invalid Metric",
    type: "DAILY",
    metric: "UNKNOWN_METRIC",
    startsAt: "2026-09-25T00:00:00.000Z",
    endsAt: "2026-09-26T00:00:00.000Z",
  });
  assert.equal(res.success, false);
});

test("Unit: createTournamentSchema rejects endsAt before or equal to startsAt", () => {
  const res = createTournamentSchema.safeParse({
    name: "Invalid Dates",
    type: "DAILY",
    metric: "BLOCKS_MINED",
    startsAt: "2026-09-26T00:00:00.000Z",
    endsAt: "2026-09-25T00:00:00.000Z",
  });
  assert.equal(res.success, false);

  const resEqual = createTournamentSchema.safeParse({
    name: "Equal Dates",
    type: "DAILY",
    metric: "BLOCKS_MINED",
    startsAt: "2026-09-25T00:00:00.000Z",
    endsAt: "2026-09-25T00:00:00.000Z",
  });
  assert.equal(resEqual.success, false);
});

test("Unit: createTournamentSchema rejects tournament duration exceeding 90 days", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const end = new Date(start.getTime() + 91 * 24 * 60 * 60 * 1000);

  const res = createTournamentSchema.safeParse({
    name: "Too Long",
    type: "CUSTOM",
    metric: "BLOCKS_MINED",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  });
  assert.equal(res.success, false);
});

test("Unit: prizeInputSchema rejects rankTo < rankFrom", () => {
  const res = prizeInputSchema.safeParse({
    rankFrom: 5,
    rankTo: 2,
    prizeType: "POL",
    polAmount: 10,
  });
  assert.equal(res.success, false);
});

test("Unit: prizeInputSchema validates MACHINE prize type structure", () => {
  const res = prizeInputSchema.safeParse({
    rankFrom: 1,
    rankTo: 1,
    prizeType: "MACHINE",
    minerId: 10,
    minerCount: 2,
  });
  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.data.minerId, 10);
    assert.equal(res.data.minerCount, 2);
  }
});

test("Unit: updateTournamentSchema accepts partial valid updates", () => {
  const res = updateTournamentSchema.safeParse({
    name: "Nome Atualizado",
    recurring: false,
  });
  assert.equal(res.success, true);
});

test("Unit: tournamentIdParamSchema validates positive integers", () => {
  assert.equal(tournamentIdParamSchema.safeParse({ id: "1" }).success, true);
  assert.equal(tournamentIdParamSchema.safeParse({ id: 42 }).success, true);
  assert.equal(tournamentIdParamSchema.safeParse({ id: "0" }).success, false);
  assert.equal(tournamentIdParamSchema.safeParse({ id: "-3" }).success, false);
  assert.equal(tournamentIdParamSchema.safeParse({ id: "abc" }).success, false);
});

test("Unit: updateDisplayOrderSchema validates array length between 1 and 20", () => {
  assert.equal(updateDisplayOrderSchema.safeParse({ typeOrder: ["DAILY", "WEEKLY"] }).success, true);
  assert.equal(updateDisplayOrderSchema.safeParse({ typeOrder: [] }).success, false);
  assert.equal(
    updateDisplayOrderSchema.safeParse({
      typeOrder: Array.from({ length: 21 }, (_, i) => `T${i}`),
    }).success,
    false,
  );
});
