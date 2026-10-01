import test from "node:test";
import assert from "node:assert/strict";

const { MINERCORE_IMAGE_OFFER_LEGACY_NAMES, MINERCORE_IMAGE_OFFER_MINERS } = await import(
  "../../server/modules/offer-events/offer-events.config.ts"
);

test("MinerCore image miners are three named PNG cards and not the 3D model", () => {
  assert.equal(MINERCORE_IMAGE_OFFER_MINERS.length, 3);
  const names = MINERCORE_IMAGE_OFFER_MINERS.map((miner) => miner.name);
  assert.deepEqual(names, ["Gildcore", "Amberforge", "Hexcore"]);
  assert.deepEqual(MINERCORE_IMAGE_OFFER_LEGACY_NAMES, {
    Gildcore: "MinerCore DOGE",
    Amberforge: "MinerCore BTC",
    Hexcore: "MinerCore MCORE",
  });
  for (const miner of MINERCORE_IMAGE_OFFER_MINERS) {
    assert.match(miner.imageUrl, /^\/media\/offers\/[a-z]+-cut\.png$/);
    assert.equal(miner.imageUrl.includes("glb"), false);
    assert.ok(miner.description.length > 0);
    assert.ok(Number(miner.priceBlk) > 0);
    assert.ok(miner.hashRate > 0);
  }
});
