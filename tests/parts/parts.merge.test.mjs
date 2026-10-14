import test from "node:test";
import assert from "node:assert/strict";

const merge = await import("../../server/modules/parts/parts.merge.ts");

test("merge fee is 10% of the base price, rounded to 8 decimals", () => {
  assert.equal(merge.mergeFeeBlk(0.5, merge.DEFAULT_MERGE_FEE_BASIS_POINTS), 0.05);
  assert.equal(merge.mergeFeeBlk(1, merge.DEFAULT_MERGE_FEE_BASIS_POINTS), 0.1);
  assert.equal(merge.mergeFeeBlk(0, merge.DEFAULT_MERGE_FEE_BASIS_POINTS), 0);
  assert.equal(merge.mergeFeeBlk(0.0005, merge.DEFAULT_MERGE_FEE_BASIS_POINTS), 0.00005);
});

test("merged hashrate is the combined power of two machines plus 30%", () => {
  assert.equal(merge.mergedHashRate(30, merge.DEFAULT_MERGE_HASHRATE_BOOST_BASIS_POINTS), 78);
  assert.equal(merge.mergedHashRate(10, merge.DEFAULT_MERGE_HASHRATE_BOOST_BASIS_POINTS), 26);
  assert.equal(merge.mergedHashRate(0, merge.DEFAULT_MERGE_HASHRATE_BOOST_BASIS_POINTS), 0);
  assert.equal(merge.mergedHashRate(Number.NaN, merge.DEFAULT_MERGE_HASHRATE_BOOST_BASIS_POINTS), 0);
});

test("fee and boost env readers fall back to the product defaults", () => {
  assert.equal(merge.readMergeFeeBasisPoints(undefined), merge.DEFAULT_MERGE_FEE_BASIS_POINTS);
  assert.equal(merge.readMergeFeeBasisPoints("1000"), 1000);
  assert.equal(merge.readMergeFeeBasisPoints("nope"), merge.DEFAULT_MERGE_FEE_BASIS_POINTS);
  assert.equal(merge.readMergeFeeBasisPoints("-1"), merge.DEFAULT_MERGE_FEE_BASIS_POINTS);
  assert.equal(merge.readMergeFeeBasisPoints("10001"), merge.DEFAULT_MERGE_FEE_BASIS_POINTS);
  assert.equal(merge.readMergeHashrateBoostBasisPoints(""), merge.DEFAULT_MERGE_HASHRATE_BOOST_BASIS_POINTS);
  assert.equal(merge.readMergeHashrateBoostBasisPoints("3000"), 3000);
  assert.equal(merge.readMergeHashrateBoostBasisPoints("1.5"), merge.DEFAULT_MERGE_HASHRATE_BOOST_BASIS_POINTS);
});

test("spendPartStacksInTx decrements each stack and rejects a short one", async () => {
  const stacks = [
    { userId: 7, partSlug: "asic_chip", quantity: 1 },
    { userId: 7, partSlug: "power_cable", quantity: 2 },
  ];
  const tx = {
    userPartStack: {
      async updateMany({ where, data }) {
        const row = stacks.find(
          (item) => item.userId === where.userId && item.partSlug === where.partSlug && item.quantity >= where.quantity.gte,
        );
        if (!row) return { count: 0 };
        row.quantity -= data.quantity.decrement;
        return { count: 1 };
      },
    },
  };

  await merge.spendPartStacksInTx(tx, 7, [
    { slug: "power_cable", required: 2 },
    { slug: "asic_chip", required: 1 },
  ]);
  assert.equal(stacks.find((row) => row.partSlug === "power_cable").quantity, 0);
  assert.equal(stacks.find((row) => row.partSlug === "asic_chip").quantity, 0);

  await assert.rejects(
    () => merge.spendPartStacksInTx(tx, 7, [{ slug: "power_cable", required: 1 }]),
    (error) => error.code === "PARTS_MERGE_INSUFFICIENT_PARTS" && error.http === 409,
  );
});

test("parseMergeMachineSource keeps the catalog as the default and accepts offers", () => {
  assert.equal(merge.parseMergeMachineSource(undefined), "catalog");
  assert.equal(merge.parseMergeMachineSource(""), "catalog");
  assert.equal(merge.parseMergeMachineSource("catalog"), "catalog");
  assert.equal(merge.parseMergeMachineSource("offer"), "offer");
  assert.throws(
    () => merge.parseMergeMachineSource("shop"),
    (error) => error.code === "PARTS_MERGE_INVALID_MINER" && error.http === 400,
  );
});

test("parseMergePlates accepts two plates of the same rarity and rejects the rest", () => {
  assert.equal(merge.MERGE_PLATE_COUNT, 2);
  assert.deepEqual(
    merge.parseMergePlates([
      { slug: "hashboard", rarity: "rare" },
      { slug: "cooling_fan", rarity: "rare" },
    ]),
    [
      { slug: "hashboard", rarity: "rare" },
      { slug: "cooling_fan", rarity: "rare" },
    ],
  );
  assert.throws(
    () => merge.parseMergePlates([
      { slug: "hashboard", rarity: "rare" },
      { slug: "hashboard", rarity: "epic" },
    ]),
    (error) => error.code === "PARTS_MERGE_RARITY_MISMATCH" && error.http === 409,
  );
  assert.throws(
    () => merge.parseMergePlates([{ slug: "hashboard", rarity: "rare" }]),
    (error) => error.code === "PARTS_MERGE_INVALID_PLATES" && error.http === 400,
  );
  assert.throws(
    () => merge.parseMergePlates([
      { slug: "nope", rarity: "rare" },
      { slug: "hashboard", rarity: "rare" },
    ]),
    (error) => error.code === "PARTS_MERGE_INVALID_PLATES" && error.http === 400,
  );
});

test("spendMergePlatesInTx spends two of one stack or one of each same-rarity stack", async () => {
  const stacks = [
    { userId: 7, partSlug: "hashboard", rarity: "rare", quantity: 2 },
    { userId: 7, partSlug: "cooling_fan", rarity: "epic", quantity: 1 },
    { userId: 7, partSlug: "asic_chip", rarity: "epic", quantity: 1 },
  ];
  const tx = {
    userPartStack: {
      async updateMany({ where, data }) {
        const row = stacks.find(
          (item) =>
            item.userId === where.userId &&
            item.partSlug === where.partSlug &&
            item.rarity === where.rarity &&
            item.quantity >= where.quantity.gte,
        );
        if (!row) return { count: 0 };
        row.quantity -= data.quantity.decrement;
        return { count: 1 };
      },
    },
  };

  await merge.spendMergePlatesInTx(
    tx,
    7,
    merge.parseMergePlates([
      { slug: "hashboard", rarity: "rare" },
      { slug: "hashboard", rarity: "rare" },
    ]),
  );
  assert.equal(stacks.find((row) => row.partSlug === "hashboard").quantity, 0);

  await merge.spendMergePlatesInTx(
    tx,
    7,
    merge.parseMergePlates([
      { slug: "cooling_fan", rarity: "epic" },
      { slug: "asic_chip", rarity: "epic" },
    ]),
  );
  assert.equal(stacks.find((row) => row.partSlug === "cooling_fan").quantity, 0);
  assert.equal(stacks.find((row) => row.partSlug === "asic_chip").quantity, 0);

  await assert.rejects(
    () => merge.spendMergePlatesInTx(
      tx,
      7,
      merge.parseMergePlates([
        { slug: "hashboard", rarity: "rare" },
        { slug: "hashboard", rarity: "rare" },
      ]),
    ),
    (error) => error.code === "PARTS_MERGE_INSUFFICIENT_PARTS" && error.http === 409,
  );
});
