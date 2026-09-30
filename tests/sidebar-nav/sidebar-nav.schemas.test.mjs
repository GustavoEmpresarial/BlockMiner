import test from "node:test";
import assert from "node:assert/strict";

const schemas = await import("../../server/modules/sidebar-nav/sidebar-nav.schemas.ts");

test("putSidebarNavSchema: accepts valid payload with entries", () => {
  const payload = {
    entries: [
      {
        itemId: "dashboard",
        visible: true,
        sortOrder: 10,
        section: "main",
        parentItemId: null,
      },
    ],
  };
  const result = schemas.putSidebarNavSchema.safeParse(payload);
  assert.equal(result.success, true);
});

test("putSidebarNavSchema: rejects unknown property at root level (mass assignment protection)", () => {
  const payload = {
    entries: [
      {
        itemId: "dashboard",
        visible: true,
        sortOrder: 10,
        section: "main",
        parentItemId: null,
      },
    ],
    isAdmin: true,
  };
  const result = schemas.putSidebarNavSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test("putSidebarNavSchema: rejects unknown property inside entry object (mass assignment protection)", () => {
  const payload = {
    entries: [
      {
        itemId: "dashboard",
        visible: true,
        sortOrder: 10,
        section: "main",
        parentItemId: null,
        dangerousCode: "eval(1)",
      },
    ],
  };
  const result = schemas.putSidebarNavSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test("putSidebarNavSchema: rejects invalid section enum", () => {
  const payload = {
    entries: [
      {
        itemId: "dashboard",
        visible: true,
        sortOrder: 10,
        section: "invalid_section",
        parentItemId: null,
      },
    ],
  };
  const result = schemas.putSidebarNavSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test("putSidebarNavSchema: rejects non-integer or negative sortOrder", () => {
  const payloadNegative = {
    entries: [
      {
        itemId: "dashboard",
        visible: true,
        sortOrder: -5,
        section: "main",
        parentItemId: null,
      },
    ],
  };
  assert.equal(schemas.putSidebarNavSchema.safeParse(payloadNegative).success, false);

  const payloadFloat = {
    entries: [
      {
        itemId: "dashboard",
        visible: true,
        sortOrder: 10.5,
        section: "main",
        parentItemId: null,
      },
    ],
  };
  assert.equal(schemas.putSidebarNavSchema.safeParse(payloadFloat).success, false);
});

test("putSidebarNavSchema: rejects empty entries array", () => {
  const payload = { entries: [] };
  const result = schemas.putSidebarNavSchema.safeParse(payload);
  assert.equal(result.success, false);
});
