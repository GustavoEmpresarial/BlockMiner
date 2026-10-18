import test from "node:test";
import assert from "node:assert/strict";

/** Kits are off sale: the route must refuse before touching idempotency, balance or parts. */
test("purchasePartPackOffer answers 404 PACK_NOT_FOUND while kits are off sale", async () => {
  const { purchasePartPackOffer } = await import("../../server/modules/offer-events/offer-events.controller.ts");
  const { PART_PACKS_ON_SALE } = await import("../../server/modules/parts/parts.pricing.ts");
  assert.equal(PART_PACKS_ON_SALE, false);

  let statusCode = 200;
  let body;
  const req = { user: { id: 1 }, body: { packId: "starter_pack" }, headers: {}, get: () => undefined };
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };
  await purchasePartPackOffer(req, res);

  assert.equal(statusCode, 404);
  assert.deepEqual(body, { ok: false, code: "PACK_NOT_FOUND", message: "Pacote de peças não encontrado." });
});
