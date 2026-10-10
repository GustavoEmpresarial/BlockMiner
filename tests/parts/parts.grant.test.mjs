import test from "node:test";
import assert from "node:assert/strict";

const { grantOfferwallPartInTx, reverseOfferwallPartInTx } = await import(
  "../../server/modules/parts/parts.grant.ts"
);

function createFakeTx() {
  const grants = [];
  const stacks = [];
  let nextGrantId = 1;
  let nextStackId = 1;

  const tx = {
    partGrant: {
      async findUnique({ where }) {
        const key = where.source_sourceRef;
        return grants.find((row) => row.source === key.source && row.sourceRef === key.sourceRef) ?? null;
      },
      async create({ data }) {
        const row = { id: nextGrantId, reversedAt: null, ...data };
        nextGrantId += 1;
        grants.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = grants.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    userPartStack: {
      async findUnique({ where }) {
        const key = where.userId_partSlug;
        return stacks.find((row) => row.userId === key.userId && row.partSlug === key.partSlug) ?? null;
      },
      async upsert({ where, create, update }) {
        const key = where.userId_partSlug;
        const existing = stacks.find((row) => row.userId === key.userId && row.partSlug === key.partSlug);
        if (!existing) {
          const row = { id: nextStackId, ...create };
          nextStackId += 1;
          stacks.push(row);
          return row;
        }
        existing.quantity += update.quantity.increment;
        return existing;
      },
      async update({ where, data }) {
        const row = stacks.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
  };

  return { tx, grants, stacks };
}

test("grant creates a stack once and ignores the same sourceRef", async () => {
  const { tx, grants, stacks } = createFakeTx();
  const first = await grantOfferwallPartInTx(tx, {
    userId: 7,
    source: "offerwallme",
    sourceRef: "tx-1",
    quantity: 1,
  });
  const second = await grantOfferwallPartInTx(tx, {
    userId: 7,
    source: "offerwallme",
    sourceRef: "tx-1",
    quantity: 1,
  });

  assert.equal(first.granted, true);
  assert.equal(second.granted, false);
  assert.equal(second.partSlug, first.partSlug);
  assert.equal(grants.length, 1);
  assert.equal(stacks.length, 1);
  assert.equal(stacks[0].quantity, 1);
  assert.equal(stacks[0].partSlug, first.partSlug);
});

test("a second sourceRef stacks another unit of whatever slug it rolls", async () => {
  const { tx, stacks } = createFakeTx();
  const first = await grantOfferwallPartInTx(tx, {
    userId: 3,
    source: "internal",
    sourceRef: "9",
    quantity: 1,
  });
  await grantOfferwallPartInTx(tx, {
    userId: 3,
    source: "internal",
    sourceRef: "9",
    quantity: 4,
  });
  const other = await grantOfferwallPartInTx(tx, {
    userId: 3,
    source: "internal",
    sourceRef: "10",
    quantity: 2,
  });

  const firstStack = stacks.find((row) => row.partSlug === first.partSlug);
  if (other.partSlug === first.partSlug) {
    assert.equal(firstStack.quantity, 3);
  } else {
    assert.equal(firstStack.quantity, 1);
    const secondStack = stacks.find((row) => row.partSlug === other.partSlug);
    assert.equal(secondStack.quantity, 2);
  }
});

test("chargeback decrements the stack and floors at zero", async () => {
  const { tx, grants, stacks } = createFakeTx();
  const granted = await grantOfferwallPartInTx(tx, {
    userId: 4,
    source: "multiwall",
    sourceRef: "cb-1",
    quantity: 2,
  });
  stacks[0].quantity = 1;

  const reversed = await reverseOfferwallPartInTx(tx, {
    source: "multiwall",
    sourceRef: "cb-1",
  });
  const again = await reverseOfferwallPartInTx(tx, {
    source: "multiwall",
    sourceRef: "cb-1",
  });

  assert.equal(reversed.reversed, true);
  assert.equal(again.reversed, false);
  assert.equal(stacks[0].quantity, 0);
  assert.ok(grants[0].reversedAt instanceof Date);
  assert.equal(stacks[0].partSlug, granted.partSlug);
});

test("chargeback of a credit that never granted a part is a no-op", async () => {
  const { tx, stacks } = createFakeTx();
  const result = await reverseOfferwallPartInTx(tx, {
    source: "offerwallgg",
    sourceRef: "legacy-callback",
  });
  assert.equal(result.reversed, false);
  assert.equal(stacks.length, 0);
});

test("blank sourceRef and zero quantity do not write", async () => {
  const { tx, grants, stacks } = createFakeTx();
  const blank = await grantOfferwallPartInTx(tx, {
    userId: 1,
    source: "zerads",
    sourceRef: "  ",
    quantity: 1,
  });
  const zero = await grantOfferwallPartInTx(tx, {
    userId: 1,
    source: "zerads",
    sourceRef: "hash",
    quantity: 0,
  });
  assert.equal(blank.granted, false);
  assert.equal(zero.granted, false);
  assert.equal(grants.length, 0);
  assert.equal(stacks.length, 0);
});
