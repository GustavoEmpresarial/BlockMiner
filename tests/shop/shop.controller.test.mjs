import test from "node:test";
import assert from "node:assert/strict";

const shopController = await import("../../server/modules/shop/shop.controller.ts");
const shopService = await import("../../server/modules/shop/shop.service.ts");
const { SHOP_ERROR_CODE, SHOP_ERROR_MESSAGE } = await import("../../server/modules/shop/shop.errors.ts");

function fakeRes() {
  const calls = { status: 200, json: null, headers: {} };
  return {
    calls,
    locals: {},
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
    setHeader(name, value) {
      calls.headers[name] = value;
      return this;
    },
    getHeader(name) {
      return calls.headers[name];
    },
  };
}

function fakeReq({ user = { id: 42, role: "USER" }, body = {}, query = {}, headers = {} } = {}) {
  return {
    user,
    body,
    query,
    headers: { "x-request-id": "req_test_shop_123", ...headers },
    path: "/api/shop/purchase",
    params: {},
  };
}

test("listMiners: returns catalog items with default pagination", async () => {
  const origList = shopController.shopServiceRef.listMinersForShop;
  try {
    shopController.shopServiceRef.listMinersForShop = async (page, pageSize) => {
      assert.equal(page, 1);
      assert.equal(pageSize, 24);
      return {
        items: [{ id: 1, name: "Antminer S19", baseHashRate: 95000, price: 150, currency: "BLK" }],
        total: 1,
        currency: "BLK",
        fans: [],
        racks: [],
        fanSalesAvailableAt: "2026-09-01T00:00:00.000Z",
        rackSalesAvailableAt: "2026-09-01T00:00:00.000Z",
      };
    };

    const req = fakeReq({ query: {} });
    const res = fakeRes();
    await shopController.listMiners(req, res);

    assert.equal(res.calls.status, 200);
    assert.equal(res.calls.json.ok, true);
    assert.equal(res.calls.json.page, 1);
    assert.equal(res.calls.json.pageSize, 24);
    assert.equal(res.calls.json.miners.length, 1);
    assert.equal(res.calls.json.miners[0].name, "Antminer S19");
  } finally {
    shopController.shopServiceRef.listMinersForShop = origList;
  }
});

test("listMiners: handles custom query parameters", async () => {
  const origList = shopController.shopServiceRef.listMinersForShop;
  try {
    let capturedPage, capturedPageSize;
    shopController.shopServiceRef.listMinersForShop = async (page, pageSize) => {
      capturedPage = page;
      capturedPageSize = pageSize;
      return {
        items: [],
        total: 0,
        currency: "BLK",
        fans: [],
        racks: [],
        fanSalesAvailableAt: null,
        rackSalesAvailableAt: null,
      };
    };

    const req = fakeReq({ query: { page: "2", pageSize: "10" } });
    const res = fakeRes();
    await shopController.listMiners(req, res);

    assert.equal(res.calls.status, 200);
    assert.equal(capturedPage, 2);
    assert.equal(capturedPageSize, 10);
  } finally {
    shopController.shopServiceRef.listMinersForShop = origList;
  }
});

test("listMiners: handles service error with 500 and SHOP_LIST_ERROR", async () => {
  const origList = shopController.shopServiceRef.listMinersForShop;
  try {
    shopController.shopServiceRef.listMinersForShop = async () => {
      throw new Error("DB connection timeout");
    };

    const req = fakeReq({ query: {} });
    const res = fakeRes();
    await shopController.listMiners(req, res);

    assert.equal(res.calls.status, 500);
    assert.equal(res.calls.json.ok, false);
    assert.equal(res.calls.json.code, SHOP_ERROR_CODE.SHOP_LIST_ERROR);
  } finally {
    shopController.shopServiceRef.listMinersForShop = origList;
  }
});

test("purchaseMiner: rejects invalid minerId", async () => {
  const req = fakeReq({ body: { minerId: -1, quantity: 1 } });
  const res = fakeRes();
  await shopController.purchaseMiner(req, res);

  assert.equal(res.calls.status, 400);
  assert.equal(res.calls.json.ok, false);
  assert.equal(res.calls.json.code, SHOP_ERROR_CODE.SHOP_INVALID_MINER_ID);
});

test("purchaseMiner: rejects invalid quantity (< 1 or > maxBulk)", async () => {
  // Quantity <= 0
  {
    const req = fakeReq({ body: { minerId: 1, quantity: 0 } });
    const res = fakeRes();
    await shopController.purchaseMiner(req, res);

    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.ok, false);
    assert.equal(res.calls.json.code, SHOP_ERROR_CODE.SHOP_INVALID_QUANTITY);
  }

  // Quantity > 25
  {
    const req = fakeReq({ body: { minerId: 1, quantity: 99 } });
    const res = fakeRes();
    await shopController.purchaseMiner(req, res);

    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.ok, false);
    assert.equal(res.calls.json.code, SHOP_ERROR_CODE.SHOP_INVALID_QUANTITY);
  }
});

test("purchaseFan: rejects invalid sku or quantity", async () => {
  // Empty SKU
  {
    const req = fakeReq({ body: { sku: "", quantity: 1 } });
    const res = fakeRes();
    await shopController.purchaseFan(req, res);

    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.ok, false);
    assert.equal(res.calls.json.code, SHOP_ERROR_CODE.FAN_INVALID_SKU);
  }

  // Invalid quantity
  {
    const req = fakeReq({ body: { sku: "fan-1", quantity: -2 } });
    const res = fakeRes();
    await shopController.purchaseFan(req, res);

    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.ok, false);
    assert.equal(res.calls.json.code, SHOP_ERROR_CODE.FAN_INVALID_QUANTITY);
  }
});

test("purchaseRack: rejects invalid sku or quantity", async () => {
  // Whitespace SKU
  {
    const req = fakeReq({ body: { sku: "   ", quantity: 1 } });
    const res = fakeRes();
    await shopController.purchaseRack(req, res);

    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.ok, false);
    assert.equal(res.calls.json.code, SHOP_ERROR_CODE.RACK_INVALID_SKU);
  }

  // Quantity > maxBulk
  {
    const req = fakeReq({ body: { sku: "rack-1", quantity: 50 } });
    const res = fakeRes();
    await shopController.purchaseRack(req, res);

    assert.equal(res.calls.status, 400);
    assert.equal(res.calls.json.ok, false);
    assert.equal(res.calls.json.code, SHOP_ERROR_CODE.RACK_INVALID_QUANTITY);
  }
});
