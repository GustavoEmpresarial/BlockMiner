/**
 * /offer-events/active is polled by every open sidebar. The event list is the same for everyone,
 * so it is cached briefly and shared; the per-user lookups run in parallel.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const repoSpec = pathToFileURL(path.join(root, "server/modules/offer-events/offer-events.repository.ts")).href;
const roomsSpec = pathToFileURL(path.join(root, "server/modules/rooms/rooms.service.ts")).href;

let listCalls = 0;
let listImpl = async () => [];
const inFlight = { now: 0, max: 0 };
async function tracked(value) {
  inFlight.now += 1;
  inFlight.max = Math.max(inFlight.max, inFlight.now);
  await new Promise((r) => setTimeout(r, 5));
  inFlight.now -= 1;
  return value;
}

mock.module(repoSpec, {
  namedExports: {
    listActiveOfferEvents: async (where) => {
      listCalls += 1;
      return listImpl(where);
    },
    groupEventPurchaseClaimCounts: async () => tracked([{ eventMinerId: 11, _count: { id: 2 } }]),
    listPendingDeliveryAts: async () => tracked([]),
    deactivateExpiredOfferEventsWhere: async () => ({ count: 1 }),
    incrementSoldCountOptimistic: async () => {},
    listDueEventMinerDeliveryIds: async () => [],
  },
});
mock.module(roomsSpec, { namedExports: { countUnlockedRoomsForUser: async () => tracked(3) } });

const svc = await import("../../server/modules/offer-events/offer-events.service.ts");

const event = {
  id: 1,
  title: "E",
  startsAt: new Date(Date.now() - 60_000),
  endsAt: new Date(Date.now() + 3_600_000),
  isActive: true,
  deletedAt: null,
  miners: [{ id: 11, name: "M", hashRate: 1, price: 1, currency: "POL", isFree: false, isActive: true, stockUnlimited: true, soldCount: 0 }],
};

test("event list is fetched once and shared across users within the TTL", async () => {
  svc.invalidateActiveOfferEventsCache();
  listCalls = 0;
  listImpl = async () => [event];
  const [a, b] = await Promise.all([svc.listActiveOfferEventsForUser(1), svc.listActiveOfferEventsForUser(2)]);
  await svc.listActiveOfferEventsForUser(undefined);
  assert.equal(listCalls, 1);
  assert.equal(a.events.length, 1);
  assert.equal(b.events.length, 1);
});

test("per-user claim counts stay per user and the three lookups run in parallel", async () => {
  svc.invalidateActiveOfferEventsCache();
  listImpl = async () => [event];
  inFlight.max = 0;
  const r = await svc.listActiveOfferEventsForUser(7);
  assert.equal(inFlight.max, 3);
  assert.equal(r.events[0].miners[0].userClaimCount, 2);
  const anon = await svc.listActiveOfferEventsForUser(undefined);
  assert.equal(anon.events[0].miners[0].userClaimCount, 0);
});

test("invalidate forces a fresh read (purchase / admin edit / expiry cron)", async () => {
  svc.invalidateActiveOfferEventsCache();
  listCalls = 0;
  await svc.listActiveOfferEventsForUser(1);
  svc.invalidateActiveOfferEventsCache();
  await svc.listActiveOfferEventsForUser(1);
  assert.equal(listCalls, 2);
  listCalls = 0;
  await svc.deactivateExpiredOfferEvents();
  await svc.listActiveOfferEventsForUser(1);
  assert.equal(listCalls, 1);
});

test("a failed read is not cached", async () => {
  svc.invalidateActiveOfferEventsCache();
  listCalls = 0;
  listImpl = async () => {
    throw new Error("db down");
  };
  await assert.rejects(svc.listActiveOfferEventsForUser(1), /db down/);
  listImpl = async () => [event];
  const r = await svc.listActiveOfferEventsForUser(1);
  assert.equal(r.events.length, 1);
  assert.equal(listCalls, 2);
});

test("entries expire after the TTL", async () => {
  svc.invalidateActiveOfferEventsCache();
  listCalls = 0;
  listImpl = async () => [event];
  const realNow = Date.now;
  try {
    await svc.listActiveOfferEventsForUser(1);
    const t0 = realNow();
    Date.now = () => t0 + svc.ACTIVE_OFFER_EVENTS_CACHE_MS + 1;
    await svc.listActiveOfferEventsForUser(1);
  } finally {
    Date.now = realNow;
  }
  assert.equal(listCalls, 2);
});
