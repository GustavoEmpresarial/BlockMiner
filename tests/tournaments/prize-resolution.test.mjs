import test from "node:test";
import assert from "node:assert/strict";

const {
  resolvePrizeGrant,
  validatePrizeInput,
  findPrizeForRank,
  maxPrizeRank,
  assignRanks,
} = await import("../../server/modules/tournaments/tournaments.prize-resolution.ts");

const { TOURNAMENT_ERROR } = await import("../../server/modules/tournaments/tournaments.errors.ts");

const band = { rankFrom: 1, rankTo: 1 };
const miner = { id: 7, name: "Rig 7", imageUrl: "/rig7.png", baseHashRate: 250, slotSize: 2 };

// ─── resolvePrizeGrant: happy paths ──────────────────────────────────────────

test("resolvePrizeGrant resolves POL and BLK to their amounts", () => {
  assert.deepEqual(resolvePrizeGrant({ ...band, prizeType: "POL", polAmount: 12.5 }), {
    kind: "pol",
    amount: 12.5,
  });
  assert.deepEqual(resolvePrizeGrant({ ...band, prizeType: "BLK", blkAmount: 300 }), {
    kind: "blk",
    amount: 300,
  });
});

test("resolvePrizeGrant resolves MINING_BOOST to hashrate + hours", () => {
  const grant = resolvePrizeGrant({
    ...band,
    prizeType: "MINING_BOOST",
    boostHashRate: 500,
    boostHours: 24,
  });
  assert.deepEqual(grant, { kind: "boost", hashRate: 500, hours: 24 });
});

test("resolvePrizeGrant resolves MACHINE from the joined miner row", () => {
  const grant = resolvePrizeGrant({ ...band, prizeType: "MACHINE", minerId: 7, miner });
  assert.deepEqual(grant, {
    kind: "machine",
    minerId: 7,
    minerName: "Rig 7",
    minerImageUrl: "/rig7.png",
    slotSize: 2,
    hashRate: 250,
    quantity: 1,
  });
});

// ─── regression: the silent-no-op bug that left players unpaid ───────────────
// A prize with a null/zero amount used to fall through every branch, grant
// nothing, and still flag the entry rewardGranted — unpayable forever.

for (const polAmount of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`POL prize with polAmount ${String(polAmount)} is invalid, never silent`, () => {
    const grant = resolvePrizeGrant({ ...band, prizeType: "POL", polAmount });
    assert.equal(grant.kind, "invalid");
    assert.equal(grant.code, TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT);
    assert.match(grant.reason, /polAmount/);
  });
}

for (const blkAmount of [null, undefined, 0, -1]) {
  test(`BLK prize with blkAmount ${String(blkAmount)} is invalid, never silent`, () => {
    const grant = resolvePrizeGrant({ ...band, prizeType: "BLK", blkAmount });
    assert.equal(grant.kind, "invalid");
    assert.equal(grant.code, TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT);
  });
}

test("MINING_BOOST missing either half is invalid", () => {
  const noHours = resolvePrizeGrant({
    ...band,
    prizeType: "MINING_BOOST",
    boostHashRate: 500,
    boostHours: null,
  });
  assert.equal(noHours.kind, "invalid");
  assert.equal(noHours.code, TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT);

  const noRate = resolvePrizeGrant({
    ...band,
    prizeType: "MINING_BOOST",
    boostHashRate: 0,
    boostHours: 24,
  });
  assert.equal(noRate.kind, "invalid");
});

test("MACHINE without a joined miner is invalid, not a thrown error", () => {
  const grant = resolvePrizeGrant({ ...band, prizeType: "MACHINE", minerId: 7, miner: null });
  assert.equal(grant.kind, "invalid");
  assert.equal(grant.code, TOURNAMENT_ERROR.PRIZE_MINER_MISSING);
});

test("unknown prizeType is invalid rather than ignored", () => {
  const grant = resolvePrizeGrant({ ...band, prizeType: "FREE_SPINS" });
  assert.equal(grant.kind, "invalid");
  assert.equal(grant.code, TOURNAMENT_ERROR.PRIZE_UNSUPPORTED_TYPE);
});

test("MACHINE quantity floors to a whole number and never drops below 1", () => {
  const zero = resolvePrizeGrant({ ...band, prizeType: "MACHINE", miner, minerCount: 0 });
  assert.equal(zero.quantity, 1);
  const fractional = resolvePrizeGrant({ ...band, prizeType: "MACHINE", miner, minerCount: 3.9 });
  assert.equal(fractional.quantity, 3);
  const missing = resolvePrizeGrant({ ...band, prizeType: "MACHINE", miner, minerCount: null });
  assert.equal(missing.quantity, 1);
});

test("MACHINE with zero baseHashRate is still payable", () => {
  const grant = resolvePrizeGrant({
    ...band,
    prizeType: "MACHINE",
    miner: { ...miner, baseHashRate: 0 },
  });
  assert.equal(grant.kind, "machine");
  assert.equal(grant.hashRate, 0);
});

// ─── validatePrizeInput (admin write-time guard) ─────────────────────────────

test("validatePrizeInput rejects unpayable amounts before they are stored", () => {
  assert.equal(validatePrizeInput({ ...band, prizeType: "POL", polAmount: 5 }).ok, true);
  const bad = validatePrizeInput({ ...band, prizeType: "POL", polAmount: 0 });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT);
});

test("validatePrizeInput checks MACHINE by minerId, not by a joined row", () => {
  assert.equal(validatePrizeInput({ ...band, prizeType: "MACHINE", minerId: 7 }).ok, true);
  const bad = validatePrizeInput({ ...band, prizeType: "MACHINE", minerId: null });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, TOURNAMENT_ERROR.PRIZE_MINER_MISSING);
});

test("validatePrizeInput rejects nonsensical rank bands", () => {
  assert.equal(validatePrizeInput({ rankFrom: 0, rankTo: 3, prizeType: "POL", polAmount: 1 }).ok, false);
  assert.equal(validatePrizeInput({ rankFrom: 5, rankTo: 2, prizeType: "POL", polAmount: 1 }).ok, false);
  assert.equal(
    validatePrizeInput({ rankFrom: 1.5, rankTo: 3, prizeType: "POL", polAmount: 1 }).ok,
    false,
  );
});

// ─── rank bands ──────────────────────────────────────────────────────────────

test("maxPrizeRank bounds the grant loop", () => {
  assert.equal(maxPrizeRank([]), 0);
  assert.equal(maxPrizeRank([{ rankTo: 1 }, { rankTo: 10 }, { rankTo: 3 }]), 10);
});

test("findPrizeForRank is inclusive on both ends", () => {
  const prizes = [
    { rankFrom: 1, rankTo: 1, prizeType: "POL" },
    { rankFrom: 2, rankTo: 5, prizeType: "BLK" },
  ];
  assert.equal(findPrizeForRank(prizes, 1).prizeType, "POL");
  assert.equal(findPrizeForRank(prizes, 2).prizeType, "BLK");
  assert.equal(findPrizeForRank(prizes, 5).prizeType, "BLK");
  assert.equal(findPrizeForRank(prizes, 6), undefined);
});

// ─── ranking ─────────────────────────────────────────────────────────────────

test("assignRanks orders by score desc", () => {
  const ranked = assignRanks([
    { id: 1, userId: 10, score: 50 },
    { id: 2, userId: 20, score: 90 },
    { id: 3, userId: 30, score: 70 },
  ]);
  assert.deepEqual(
    ranked.map((e) => [e.id, e.rank]),
    [
      [2, 1],
      [3, 2],
      [1, 3],
    ],
  );
});

test("assignRanks breaks score ties by earliest firstContributionAt", () => {
  const ranked = assignRanks([
    { id: 1, userId: 10, score: 100, firstContributionAt: new Date("2026-09-02T00:00:00Z") },
    { id: 2, userId: 20, score: 100, firstContributionAt: new Date("2026-09-01T00:00:00Z") },
  ]);
  assert.deepEqual(
    ranked.map((e) => e.id),
    [2, 1],
  );
});

test("assignRanks sorts never-contributed entries last within their score group", () => {
  const ranked = assignRanks([
    { id: 1, userId: 10, score: 100, firstContributionAt: null },
    { id: 2, userId: 20, score: 100, firstContributionAt: new Date("2026-09-01T00:00:00Z") },
  ]);
  assert.deepEqual(
    ranked.map((e) => e.id),
    [2, 1],
  );
});

test("assignRanks is deterministic when score and timestamp both tie", () => {
  const at = new Date("2026-09-01T00:00:00Z");
  const ranked = assignRanks([
    { id: 9, userId: 10, score: 100, firstContributionAt: at },
    { id: 4, userId: 20, score: 100, firstContributionAt: at },
  ]);
  assert.deepEqual(
    ranked.map((e) => e.id),
    [4, 9],
  );
});

test("assignRanks coerces Decimal-like scores", () => {
  const decimalish = (n) => ({ toString: () => String(n), valueOf: () => n });
  const ranked = assignRanks([
    { id: 1, userId: 10, score: decimalish(10) },
    { id: 2, userId: 20, score: decimalish(80) },
  ]);
  assert.deepEqual(
    ranked.map((e) => e.id),
    [2, 1],
  );
});

// ─── Branch edges ────────────────────────────────────────────────────────────
// Cases that only exercise a guard's second half. They look pedantic, but each
// one is a way a prize row can arrive from the admin panel or from Prisma.

test("positive() rejects NaN and Infinity, not just null and zero", () => {
  // Number("abc") is NaN and Number(null) is 0 — both must be refused, or a
  // prize resolves to a grant of NaN and the payout writes garbage.
  for (const bad of [NaN, Infinity, -Infinity, "abc", {}, []]) {
    const out = resolvePrizeGrant({ ...band, prizeType: "POL", polAmount: bad });
    assert.equal(out.kind, "invalid", `polAmount ${String(bad)} must be invalid`);
    assert.equal(out.code, TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT);
  }
});

test("MINING_BOOST invalid when only hashRate is missing, and when only hours is", () => {
  const onlyHours = resolvePrizeGrant({
    ...band,
    prizeType: "MINING_BOOST",
    boostHashRate: 0,
    boostHours: 5,
  });
  assert.equal(onlyHours.kind, "invalid");

  const onlyRate = resolvePrizeGrant({
    ...band,
    prizeType: "MINING_BOOST",
    boostHashRate: 50,
    boostHours: null,
  });
  assert.equal(onlyRate.kind, "invalid");
});

test("MACHINE falls back when imageUrl and slotSize are absent", () => {
  const bare = { id: 3, name: "Bare", imageUrl: null, baseHashRate: 10 };
  const out = resolvePrizeGrant({ ...band, prizeType: "MACHINE", miner: bare });
  assert.equal(out.kind, "machine");
  assert.equal(out.minerImageUrl, null);
  assert.equal(out.slotSize, 1, "a miner with no slotSize must default to 1 slot");
});

test("MACHINE treats a null baseHashRate as zero", () => {
  const out = resolvePrizeGrant({
    ...band,
    prizeType: "MACHINE",
    miner: { ...miner, baseHashRate: null },
  });
  assert.equal(out.kind, "machine");
  assert.equal(out.hashRate, 0);
});

test("MACHINE with a non-numeric baseHashRate is invalid, not NaN hashrate", () => {
  const out = resolvePrizeGrant({
    ...band,
    prizeType: "MACHINE",
    miner: { ...miner, baseHashRate: "fast" },
  });
  assert.equal(out.kind, "invalid");
  assert.equal(out.code, TOURNAMENT_ERROR.PRIZE_INVALID_AMOUNT);
});

test("MACHINE quantity falls back to 1 when minerCount is not a finite number", () => {
  for (const bad of [NaN, Infinity, "many", undefined, null]) {
    const out = resolvePrizeGrant({ ...band, prizeType: "MACHINE", miner, minerCount: bad });
    assert.equal(out.kind, "machine");
    assert.equal(out.quantity, 1, `minerCount ${String(bad)} should fall back to 1`);
  }
});

test("maxPrizeRank ignores non-finite rankTo values", () => {
  // A NaN rankTo would otherwise poison the comparison and return NaN, making
  // ranked.slice(0, NaN) empty — every winner silently skipped.
  assert.equal(maxPrizeRank([{ rankTo: 3 }, { rankTo: NaN }, { rankTo: "x" }]), 3);
  assert.equal(maxPrizeRank([]), 0);
});

test("assignRanks coerces a NaN score to zero rather than scrambling the order", () => {
  const ranked = assignRanks([
    { id: 1, userId: 1, score: NaN },
    { id: 2, userId: 2, score: 10 },
  ]);
  assert.deepEqual(
    ranked.map((e) => e.id),
    [2, 1],
  );
});

test("validatePrizeInput accepts a well-formed non-MACHINE prize", () => {
  assert.deepEqual(validatePrizeInput({ ...band, prizeType: "BLK", blkAmount: 5 }), { ok: true });
});

test("validatePrizeInput rejects an unsupported prizeType", () => {
  const out = validatePrizeInput({ ...band, prizeType: "GOLD" });
  assert.equal(out.ok, false);
  assert.equal(out.code, TOURNAMENT_ERROR.PRIZE_UNSUPPORTED_TYPE);
});

test("findPrizeForRank returns undefined outside every band", () => {
  assert.equal(findPrizeForRank([{ rankFrom: 1, rankTo: 3 }], 4), undefined);
  assert.equal(findPrizeForRank([], 1), undefined);
});

test("MINING_BOOST with both halves missing, and with both valid", () => {
  // Completes the truth table of `hashRate === null || hours === null`.
  assert.equal(resolvePrizeGrant({ ...band, prizeType: "MINING_BOOST" }).kind, "invalid");
  assert.deepEqual(
    resolvePrizeGrant({ ...band, prizeType: "MINING_BOOST", boostHashRate: 10, boostHours: 2 }),
    { kind: "boost", hashRate: 10, hours: 2 },
  );
});
