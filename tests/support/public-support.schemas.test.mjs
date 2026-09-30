import test from "node:test";
import assert from "node:assert/strict";

const schemas = await import("../../server/modules/support/public-support.schemas.ts");

// ─── publicSupportIdParamSchema ──────────────────────────────────────────────

test("publicSupportIdParamSchema: accepts valid integer id", () => {
  const result = schemas.publicSupportIdParamSchema.safeParse({ id: "42" });
  assert.equal(result.success, true);
  assert.equal(result.data.id, 42);
});

test("publicSupportIdParamSchema: rejects negative id", () => {
  const result = schemas.publicSupportIdParamSchema.safeParse({ id: "-1" });
  assert.equal(result.success, false);
});

test("publicSupportIdParamSchema: rejects float id", () => {
  const result = schemas.publicSupportIdParamSchema.safeParse({ id: "3.14" });
  assert.equal(result.success, false);
});

test("publicSupportIdParamSchema: rejects 32-bit overflow id", () => {
  const result = schemas.publicSupportIdParamSchema.safeParse({ id: "9999999999" });
  assert.equal(result.success, false);
});

test("publicSupportIdParamSchema: rejects non-numeric id", () => {
  const result = schemas.publicSupportIdParamSchema.safeParse({ id: "abc" });
  assert.equal(result.success, false);
});

test("publicSupportIdParamSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.publicSupportIdParamSchema.safeParse({ id: "1", isAdmin: true });
  assert.equal(result.success, false);
});

// ─── adminPublicSupportQuerySchema ───────────────────────────────────────────

test("adminPublicSupportQuerySchema: applies defaults when empty", () => {
  const result = schemas.adminPublicSupportQuerySchema.safeParse({});
  assert.equal(result.success, true);
  assert.equal(result.data.status, "all");
  assert.equal(result.data.page, 1);
  assert.equal(result.data.limit, 30);
});

test("adminPublicSupportQuerySchema: accepts valid status, page, limit", () => {
  const result = schemas.adminPublicSupportQuerySchema.safeParse({
    status: "open",
    page: "2",
    limit: "50",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.status, "open");
  assert.equal(result.data.page, 2);
  assert.equal(result.data.limit, 50);
});

test("adminPublicSupportQuerySchema: accepts closed status", () => {
  const result = schemas.adminPublicSupportQuerySchema.safeParse({ status: "closed" });
  assert.equal(result.success, true);
  assert.equal(result.data.status, "closed");
});

test("adminPublicSupportQuerySchema: rejects invalid status enum", () => {
  const result = schemas.adminPublicSupportQuerySchema.safeParse({ status: "pending" });
  assert.equal(result.success, false);
});

// ─── adminReplyPublicTicketSchema ────────────────────────────────────────────

test("adminReplyPublicTicketSchema: accepts valid text message", () => {
  const result = schemas.adminReplyPublicTicketSchema.safeParse({
    message: "Hello, we are looking into your issue.",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.message, "Hello, we are looking into your issue.");
});

test("adminReplyPublicTicketSchema: accepts image only (no text)", () => {
  const result = schemas.adminReplyPublicTicketSchema.safeParse({
    imageUrl: "https://cdn.blockminer.io/support/screenshot.png",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.imageUrl, "https://cdn.blockminer.io/support/screenshot.png");
});

test("adminReplyPublicTicketSchema: rejects empty body (no message and no image)", () => {
  const result = schemas.adminReplyPublicTicketSchema.safeParse({});
  assert.equal(result.success, false);
});

test("adminReplyPublicTicketSchema: rejects empty string message without image", () => {
  const result = schemas.adminReplyPublicTicketSchema.safeParse({ message: "" });
  assert.equal(result.success, false);
});

test("adminReplyPublicTicketSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminReplyPublicTicketSchema.safeParse({
    message: "Valid message",
    isAdmin: true,
    role: "super_admin",
  });
  assert.equal(result.success, false);
});

// ─── adminSetPublicTicketStatusSchema ────────────────────────────────────────

test("adminSetPublicTicketStatusSchema: accepts open", () => {
  const result = schemas.adminSetPublicTicketStatusSchema.safeParse({ status: "open" });
  assert.equal(result.success, true);
  assert.equal(result.data.status, "open");
});

test("adminSetPublicTicketStatusSchema: accepts closed", () => {
  const result = schemas.adminSetPublicTicketStatusSchema.safeParse({ status: "closed" });
  assert.equal(result.success, true);
  assert.equal(result.data.status, "closed");
});

test("adminSetPublicTicketStatusSchema: rejects invalid status value", () => {
  const result = schemas.adminSetPublicTicketStatusSchema.safeParse({ status: "pending" });
  assert.equal(result.success, false);
});

test("adminSetPublicTicketStatusSchema: rejects unknown properties (.strict mass assignment)", () => {
  const result = schemas.adminSetPublicTicketStatusSchema.safeParse({
    status: "open",
    isAdmin: true,
  });
  assert.equal(result.success, false);
});
