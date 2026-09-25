import test from "node:test";
import assert from "node:assert/strict";

const {
  createBannerSchema,
  updateBannerSchema,
  bannerIdParamSchema,
} = await import("../../server/modules/banners/banners.schemas.ts");

test("Unit: createBannerSchema accepts valid standard payload", () => {
  const payload = {
    title: "Oferta de Primavera",
    message: "Descontos especiais em todas as mineradoras.",
    imageUrl: "https://blockminer.space/uploads/banners/spring.webp",
    type: "promo",
    link: "/shop",
    linkLabel: "Conferir Loja",
    isActive: true,
    startsAt: "2026-09-01",
    endsAt: "2026-09-30",
  };

  const parsed = createBannerSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.title, "Oferta de Primavera");
    assert.equal(parsed.data.type, "promo");
    assert.equal(parsed.data.isActive, true);
  }
});

test("Unit: createBannerSchema accepts all valid banner types", () => {
  const types = ["info", "warning", "success", "promo"];
  for (const t of types) {
    const res = createBannerSchema.safeParse({ title: `Banner ${t}`, type: t });
    assert.equal(res.success, true);
  }
});

test("Unit: createBannerSchema rejects empty or missing title", () => {
  const missing = createBannerSchema.safeParse({});
  assert.equal(missing.success, false);

  const empty = createBannerSchema.safeParse({ title: "   " });
  assert.equal(empty.success, false);
});

test("Unit: createBannerSchema rejects title longer than 120 chars", () => {
  const longTitle = "A".repeat(121);
  const res = createBannerSchema.safeParse({ title: longTitle });
  assert.equal(res.success, false);
});

test("Unit: createBannerSchema rejects message longer than 500 chars", () => {
  const longMsg = "B".repeat(501);
  const res = createBannerSchema.safeParse({ title: "Válido", message: longMsg });
  assert.equal(res.success, false);
});

test("Unit: createBannerSchema rejects dangerous protocols in imageUrl (XSS/SSRF)", () => {
  const xssUrl = createBannerSchema.safeParse({
    title: "XSS Banner",
    imageUrl: "javascript:alert(document.cookie)",
  });
  assert.equal(xssUrl.success, false);

  const dataHtml = createBannerSchema.safeParse({
    title: "Data Banner",
    imageUrl: "data:text/html,<script>alert(1)</script>",
  });
  assert.equal(dataHtml.success, false);
});

test("Unit: createBannerSchema rejects dangerous protocols in link", () => {
  const xssLink = createBannerSchema.safeParse({
    title: "XSS Link",
    link: "javascript:window.location='https://attacker.com'",
  });
  assert.equal(xssLink.success, false);
});

test("Unit: createBannerSchema rejects invalid type enum", () => {
  const invalidType = createBannerSchema.safeParse({
    title: "Invalid Type",
    type: "super_special_type",
  });
  assert.equal(invalidType.success, false);
});

test("Unit: createBannerSchema rejects date range when endsAt is before startsAt", () => {
  const res = createBannerSchema.safeParse({
    title: "Invalid Range",
    startsAt: "2026-10-01",
    endsAt: "2026-09-01",
  });
  assert.equal(res.success, false);
  if (!res.success) {
    const issue = res.error.issues[0];
    assert.match(issue.message, /data final deve ser igual ou posterior/i);
  }
});

test("Unit: updateBannerSchema allows partial updates and validates field limits", () => {
  const validPartial = updateBannerSchema.safeParse({
    title: "Título Novo",
    isActive: false,
  });
  assert.equal(validPartial.success, true);

  const invalidTitle = updateBannerSchema.safeParse({
    title: "   ",
  });
  assert.equal(invalidTitle.success, false);
});

test("Unit: bannerIdParamSchema validates positive integers and rejects non-numeric or negative IDs", () => {
  assert.equal(bannerIdParamSchema.safeParse({ id: "123" }).success, true);
  assert.equal(bannerIdParamSchema.safeParse({ id: 42 }).success, true);
  assert.equal(bannerIdParamSchema.safeParse({ id: "0" }).success, false);
  assert.equal(bannerIdParamSchema.safeParse({ id: "-5" }).success, false);
  assert.equal(bannerIdParamSchema.safeParse({ id: "abc" }).success, false);
  assert.equal(bannerIdParamSchema.safeParse({ id: "12.34" }).success, false);
});
