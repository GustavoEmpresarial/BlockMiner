import test from "node:test";
import assert from "node:assert/strict";

const repo = await import("../../server/modules/banners/banners.repository.ts");
const prismaMod = await import("../../server/core/database/prisma.ts");
const prisma = prismaMod.default;

const createdIds = [];

async function makeBanner(overrides = {}) {
  const banner = await repo.createBanner({
    title: `test-banner-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    message: "",
    imageUrl: null,
    type: "info",
    link: null,
    linkLabel: null,
    isActive: true,
    startsAt: null,
    endsAt: null,
    ...overrides,
  });
  createdIds.push(banner.id);
  return banner;
}

test.after(async () => {
  await prisma.dashboardBanner.deleteMany({ where: { id: { in: createdIds } } });
  await prisma.$disconnect();
});

test("listActiveBannersNow: excludes isActive=false", async () => {
  const active = await makeBanner({ isActive: true });
  const inactive = await makeBanner({ isActive: false });

  const now = new Date();
  const results = await repo.listActiveBannersNow(now);
  const ids = results.map((b) => b.id);
  assert.ok(ids.includes(active.id), "active banner should be listed");
  assert.ok(!ids.includes(inactive.id), "inactive banner must be excluded");
});

test("listActiveBannersNow: excludes banners whose startsAt is in the future", async () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const notYetStarted = await makeBanner({ isActive: true, startsAt: future });

  const results = await repo.listActiveBannersNow(new Date());
  assert.ok(!results.map((b) => b.id).includes(notYetStarted.id));
});

test("listActiveBannersNow: excludes banners whose endsAt is in the past", async () => {
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const expired = await makeBanner({ isActive: true, endsAt: past });

  const results = await repo.listActiveBannersNow(new Date());
  assert.ok(!results.map((b) => b.id).includes(expired.id));
});

test("listActiveBannersNow: includes banners with null startsAt/endsAt (always-on)", async () => {
  const alwaysOn = await makeBanner({ isActive: true, startsAt: null, endsAt: null });
  const results = await repo.listActiveBannersNow(new Date());
  assert.ok(results.map((b) => b.id).includes(alwaysOn.id));
});

test("listActiveBannersNow: includes banners within an active startsAt/endsAt window", async () => {
  const start = new Date(Date.now() - 60_000);
  const end = new Date(Date.now() + 60_000);
  const inWindow = await makeBanner({ isActive: true, startsAt: start, endsAt: end });
  const results = await repo.listActiveBannersNow(new Date());
  assert.ok(results.map((b) => b.id).includes(inWindow.id));
});

test("updateBanner / deleteBanner: round trip", async () => {
  const banner = await makeBanner({ title: "before-update" });
  const updated = await repo.updateBanner(banner.id, { title: "after-update" });
  assert.equal(updated.title, "after-update");

  await repo.deleteBanner(banner.id);
  const all = await repo.listAllBanners();
  assert.ok(!all.map((b) => b.id).includes(banner.id));
  createdIds.splice(createdIds.indexOf(banner.id), 1);
});
