import test from "node:test";
import assert from "node:assert/strict";

const { MINERCORE_IMAGE_OFFER_MINERS } = await import(
  "../../server/modules/offer-events/offer-events.config.ts"
);

test("MinerCore image miners are three immediate PNG cards and not the 3D model", () => {
  assert.equal(MINERCORE_IMAGE_OFFER_MINERS.length, 3);
  const names = MINERCORE_IMAGE_OFFER_MINERS.map((miner) => miner.name);
  assert.deepEqual(names, ["MinerCore DOGE", "MinerCore BTC", "MinerCore MCORE"]);
  for (const miner of MINERCORE_IMAGE_OFFER_MINERS) {
    assert.match(miner.imageUrl, /^\/media\/offers\/minercore-.+\.png$/);
    assert.equal("modelUrl" in miner, false);
    assert.ok(Number(miner.priceBlk) > 0);
    assert.ok(miner.hashRate > 0);
  }
});
