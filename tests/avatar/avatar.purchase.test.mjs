/**
 * Money path of the profile-photo license: fresh price or no sale, conditional debit, one charge
 * per idempotency key, and two concurrent purchases from the same user charge once.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const spec = (p) => pathToFileURL(path.join(root, p)).href;

const DAY = 86_400_000;
const db = { balances: new Map(), licenses: [], avatars: new Map(), txs: [] };
const locks = new Map();
let price = { POL: 0.2, BTC: 100_000, ETH: 4000, SHIB: 0.0000055 };

async function lock(key) {
  const prev = locks.get(key) ?? Promise.resolve();
  let release;
  const next = new Promise((res) => (release = res));
  locks.set(key, prev.then(() => next));
  await prev;
  return release;
}

function makeTx(releases) {
  return {
    async $executeRaw(q, ...vals) {
      if (Array.isArray(q)) {
        releases.push(await lock(String(vals[0])));
        return 1;
      }
      // UPDATE users SET <col> = <col> - $1 WHERE id = $2 AND <col> >= $3
      const col = /SET (\w+) =/.exec(q.sql)[1];
      const [amount, userId] = q.values;
      const b = db.balances.get(userId) ?? {};
      const have = Number(b[col] ?? 0);
      if (have < Number(amount)) return 0;
      b[col] = Number((have - Number(amount)).toFixed(8));
      db.balances.set(userId, b);
      return 1;
    },
    avatarLicense: {
      findUnique: async ({ where }) => db.licenses.find((l) => l.userId === where.userId_idempotencyKey.userId && l.idempotencyKey === where.userId_idempotencyKey.idempotencyKey) ?? null,
      create: async ({ data }) => {
        const row = { id: db.licenses.length + 1, ...data };
        db.licenses.push(row);
        return row;
      },
    },
    userAvatar: {
      findUnique: async ({ where }) => db.avatars.get(where.userId) ?? null,
      upsert: async ({ where, create, update }) => {
        const cur = db.avatars.get(where.userId);
        const row = cur ? { ...cur, ...update } : { path: null, uploadBlocked: false, ...create };
        db.avatars.set(where.userId, row);
        return row;
      },
    },
    transaction: { create: async ({ data }) => db.txs.push(data) },
  };
}

mock.module(spec("server/core/database/prisma.ts"), {
  defaultExport: {
    async $transaction(fn) {
      const releases = [];
      try {
        return await fn(makeTx(releases));
      } finally {
        releases.forEach((r) => r());
      }
    },
  },
});
mock.module(spec("server/shared/cryptoPrice/cryptoPrice.ts"), {
  namedExports: { getFreshUsdPrice: async (asset) => price[asset] ?? null },
});
const invalidated = [];
mock.module(spec("server/modules/wallet/balance/balance.service.ts"), { namedExports: { invalidateBalanceCache: (id) => invalidated.push(id) } });
mock.module(spec("server/shared/security/authUser.ts"), { namedExports: { invalidateAuthUserCache: () => {} } });

const svc = await import("../../server/modules/avatar/avatar.service.ts");
const now = new Date("2026-10-19T12:00:00Z");
let n = 0;
const key = () => `key_${(n += 1)}_abcdefgh`;
function reset(userId, balances) {
  db.balances.set(userId, { ...balances });
  db.avatars.delete(userId);
  db.licenses = db.licenses.filter((l) => l.userId !== userId);
}
const buy = (userId, currency, expectedAmount, idempotencyKey = key()) =>
  svc.purchaseAvatarLicense({ userId, currency, expectedAmount, idempotencyKey, now });

test("buys with POL: debits exactly US$ 1 worth, sets a 365-day license, writes the ledger row", async () => {
  reset(1, { pol_balance: 10 });
  const r = await buy(1, "POL", "5");
  assert.equal(r.amount, "5.00000000");
  assert.equal(r.replayed, false);
  assert.equal(db.balances.get(1).pol_balance, 5);
  assert.equal(r.expiresAt, new Date(now.getTime() + 365 * DAY).toISOString());
  assert.equal(db.avatars.get(1).licenseExpiresAt.toISOString(), r.expiresAt);
  const ledger = db.txs.at(-1);
  assert.equal(ledger.type, "avatar_license");
  assert.deepEqual(JSON.parse(ledger.rawTx), { asset: "POL", licenseId: r.licenseId });
  assert.ok(invalidated.includes(1));
});

test("BLK and ZER are refused before anything is read or charged", async () => {
  reset(2, { blk_balance: 100, zer_balance: 100 });
  for (const c of ["BLK", "ZER"]) {
    await assert.rejects(buy(2, c, "1"), (e) => e.code === "AVATAR_CURRENCY_NOT_ALLOWED");
  }
  assert.equal(db.licenses.filter((l) => l.userId === 2).length, 0);
});

test("insufficient balance: nothing charged, no license", async () => {
  reset(3, { pol_balance: 4.99 });
  await assert.rejects(buy(3, "POL", "5"), (e) => e.code === "AVATAR_INSUFFICIENT_BALANCE");
  assert.equal(db.balances.get(3).pol_balance, 4.99);
  assert.equal(db.avatars.get(3), undefined);
});

test("no fresh price: no sale (never charged at a fallback price)", async () => {
  reset(4, { btc_balance: 1 });
  const saved = price;
  price = { ...price, BTC: null };
  try {
    await assert.rejects(buy(4, "BTC", "0.00001"), (e) => e.code === "AVATAR_PRICE_UNAVAILABLE");
  } finally {
    price = saved;
  }
  assert.equal(db.balances.get(4).btc_balance, 1);
});

test("price moved more than 2% above the confirmed amount: asks again, charges nothing", async () => {
  reset(5, { pol_balance: 100 });
  await assert.rejects(buy(5, "POL", "4"), (e) => e.code === "AVATAR_QUOTE_CHANGED");
  assert.equal(db.balances.get(5).pol_balance, 100);
});

test("stablecoins are 1:1 and need no price feed", async () => {
  reset(6, { usdt_balance: 3 });
  const saved = price;
  price = {};
  try {
    const r = await buy(6, "USDT", "1");
    assert.equal(r.amount, "1.00000000");
  } finally {
    price = saved;
  }
  assert.equal(db.balances.get(6).usdt_balance, 2);
});

test("same Idempotency-Key twice (retry, double click): one charge, same license back", async () => {
  reset(7, { pol_balance: 20 });
  const k = key();
  const a = await buy(7, "POL", "5", k);
  const b = await buy(7, "POL", "5", k);
  assert.equal(b.replayed, true);
  assert.equal(b.licenseId, a.licenseId);
  assert.equal(db.balances.get(7).pol_balance, 15);
});

test("two concurrent purchases with different keys: one wins, the other sees the active license", async () => {
  reset(8, { pol_balance: 20 });
  const results = await Promise.allSettled([buy(8, "POL", "5"), buy(8, "POL", "5")]);
  const ok = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(failed[0].reason.code, "AVATAR_LICENSE_ALREADY_ACTIVE");
  assert.equal(db.balances.get(8).pol_balance, 15);
});

test("renewal: refused with more than 30 days left, allowed in the last 30 and extends the expiry", async () => {
  reset(9, { pol_balance: 20 });
  db.avatars.set(9, { path: null, uploadBlocked: false, licenseExpiresAt: new Date(now.getTime() + 40 * DAY) });
  await assert.rejects(buy(9, "POL", "5"), (e) => e.code === "AVATAR_LICENSE_ALREADY_ACTIVE");
  const soon = new Date(now.getTime() + 20 * DAY);
  db.avatars.set(9, { path: null, uploadBlocked: false, licenseExpiresAt: soon });
  const r = await buy(9, "POL", "5");
  assert.equal(r.expiresAt, new Date(soon.getTime() + 365 * DAY).toISOString());
});

test("a missing or malformed Idempotency-Key is refused", async () => {
  reset(10, { pol_balance: 20 });
  for (const k of [undefined, "", "short", "has spaces in it!!", "x".repeat(65)]) {
    await assert.rejects(svc.purchaseAvatarLicense({ userId: 10, currency: "POL", expectedAmount: "5", idempotencyKey: k, now }), (e) => e.code === "AVATAR_IDEMPOTENCY_KEY_INVALID");
  }
  assert.equal(db.balances.get(10).pol_balance, 20);
});
