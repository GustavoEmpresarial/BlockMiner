import test from "node:test";
import assert from "node:assert/strict";
import { parseClientErrorBody } from "../../server/modules/traffic/traffic.schemas.js";

test("parseClientErrorBody parses fingerprint and sanitizes length", () => {
  const parsed = parseClientErrorBody({
    message: "Cannot read properties of null",
    fingerprint: "crash:cannot_read:mining_page".repeat(5),
  });
  assert.equal(parsed.fingerprint?.length, 64);
  assert.match(parsed.fingerprint ?? "", /^crash:cannot_read/);
});

test("parseClientErrorBody parses and bounds breadcrumbs to at most 15 items", () => {
  const breadcrumbs = [];
  for (let i = 0; i < 30; i++) {
    breadcrumbs.push({
      ts: Date.now() + i,
      type: i % 2 === 0 ? "navigation" : "click",
      message: `Step ${i}`,
      data: { key: `value_${i}` },
    });
  }

  const parsed = parseClientErrorBody({
    message: "Test with breadcrumbs",
    breadcrumbs,
  });

  assert.ok(Array.isArray(parsed.breadcrumbs));
  assert.equal(parsed.breadcrumbs.length, 15);
  // Must be the most recent 15
  assert.equal(parsed.breadcrumbs[14].message, "Step 29");
  assert.equal(parsed.breadcrumbs[0].message, "Step 15");
});

test("parseClientErrorBody sanitizes environment metadata", () => {
  const parsed = parseClientErrorBody({
    message: "Test with env",
    environment: {
      viewport: "1920x1080",
      connection: "4g",
      language: "pt-BR",
      memoryMb: 8192.4,
      online: true,
      extraJunk: "should be ignored",
    },
  });

  assert.deepEqual(parsed.environment, {
    viewport: "1920x1080",
    connection: "4g",
    language: "pt-BR",
    memoryMb: 8192,
    online: true,
  });
});

test("parseClientErrorBody handles null or malformed breadcrumbs/environment gracefully", () => {
  const parsed = parseClientErrorBody({
    message: "Malformed data",
    breadcrumbs: "not an array",
    environment: "not an object",
  });

  assert.equal(parsed.breadcrumbs, null);
  assert.equal(parsed.environment, null);
});
