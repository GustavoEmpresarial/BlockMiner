import test from "node:test";
import assert from "node:assert/strict";

const {
  isAdlinkflyShortlinkMaintenance,
  isAdlinkflyShortlinkApiEnabled,
  parseAdlinkflyShrinkResponse,
} = await import("../../server/modules/shortlinks/adlinkfly-shortlink.api.ts");

test("adlinkfly maintenance defaults ON when env unset", () => {
  const prev = process.env.ADLINKFLY_SHORTLINK_MAINTENANCE;
  delete process.env.ADLINKFLY_SHORTLINK_MAINTENANCE;
  assert.equal(isAdlinkflyShortlinkMaintenance(), true);
  assert.equal(isAdlinkflyShortlinkApiEnabled(), false);
  if (prev === undefined) delete process.env.ADLINKFLY_SHORTLINK_MAINTENANCE;
  else process.env.ADLINKFLY_SHORTLINK_MAINTENANCE = prev;
});

test("adlinkfly maintenance OFF only when explicitly 0", () => {
  const prevM = process.env.ADLINKFLY_SHORTLINK_MAINTENANCE;
  const prevT = process.env.ADLINKFLY_SHORTLINK_API_TOKEN;
  const prevU = process.env.ADLINKFLY_SHORTLINK_API_URL;
  process.env.ADLINKFLY_SHORTLINK_MAINTENANCE = "0";
  process.env.ADLINKFLY_SHORTLINK_API_TOKEN = "tok";
  process.env.ADLINKFLY_SHORTLINK_API_URL = "http://example.test/api";
  assert.equal(isAdlinkflyShortlinkMaintenance(), false);
  assert.equal(isAdlinkflyShortlinkApiEnabled(), true);
  if (prevM === undefined) delete process.env.ADLINKFLY_SHORTLINK_MAINTENANCE;
  else process.env.ADLINKFLY_SHORTLINK_MAINTENANCE = prevM;
  if (prevT === undefined) delete process.env.ADLINKFLY_SHORTLINK_API_TOKEN;
  else process.env.ADLINKFLY_SHORTLINK_API_TOKEN = prevT;
  if (prevU === undefined) delete process.env.ADLINKFLY_SHORTLINK_API_URL;
  else process.env.ADLINKFLY_SHORTLINK_API_URL = prevU;
});

test("parseAdlinkflyShrinkResponse accepts JSON success", () => {
  const parsed = parseAdlinkflyShrinkResponse(
    JSON.stringify({
      status: "success",
      message: "",
      shortenedUrl: "http://sh.blockminer.space/OoAwnoi71",
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.shortCode, "OoAwnoi71");
    assert.equal(parsed.externalUrl, "http://sh.blockminer.space/OoAwnoi71");
  }
});

test("parseAdlinkflyShrinkResponse rejects error status", () => {
  const parsed = parseAdlinkflyShrinkResponse(
    JSON.stringify({ status: "error", message: "invalid api", shortenedUrl: "" }),
  );
  assert.equal(parsed.ok, false);
});
