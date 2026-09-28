import test from "node:test";
import assert from "node:assert/strict";

const { getOfferwallAnalytics } = await import(
  "../../server/modules/offerwall/offerwall.admin.controller.ts"
);

function createMockRes() {
  let statusCode = 200;
  let sentData = null;

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      sentData = data;
      return this;
    },
    getStatusCode() {
      return statusCode;
    },
    getData() {
      return sentData;
    },
  };
}

test("Offerwall Analytics Controller Smoke Test: End-to-end parameter handling and reporting", async (t) => {
  await t.test("Valid query without parameters defaults to last 7 days and returns 200", async () => {
    const req = { query: {} };
    const res = createMockRes();
    await getOfferwallAnalytics(req, res);

    assert.equal(res.getStatusCode(), 200);
    const data = res.getData();
    assert.equal(data?.ok, true);
    assert.ok(data?.totals);
    assert.ok(Array.isArray(data?.daily));
    assert.ok(data?.serverNow);
    assert.ok(data?.serverNowBrt);
  });

  await t.test("Invalid date range (from > to) returns 400 Bad Request", async () => {
    const req = {
      query: {
        from: new Date("2026-09-28").toISOString(),
        to: new Date("2026-09-20").toISOString(),
      },
    };
    const res = createMockRes();
    await getOfferwallAnalytics(req, res);

    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getData()?.ok, false);
    assert.match(res.getData()?.message, /from must be before or equal to to/);
  });

  await t.test("Invalid userId (negative or string) returns 400 Bad Request", async () => {
    const req = { query: { userId: "invalid_id" } };
    const res = createMockRes();
    await getOfferwallAnalytics(req, res);

    assert.equal(res.getStatusCode(), 400);
    assert.equal(res.getData()?.ok, false);
    assert.equal(res.getData()?.message, "Invalid userId");
  });

  await t.test("Valid query with explicit userId filter returns 200", async () => {
    const req = { query: { userId: "9999999" } };
    const res = createMockRes();
    await getOfferwallAnalytics(req, res);

    assert.equal(res.getStatusCode(), 200);
    const data = res.getData();
    assert.equal(data?.ok, true);
    assert.equal(data?.userId, 9999999);
    assert.equal(data?.totals?.internal?.count, 0);
  });
});
