import test from "node:test";
import assert from "node:assert/strict";

const prices = await import("../../server/modules/parts/parts.machinePrices.ts");

function requiredMap(hashRate) {
  return Object.fromEntries(prices.partCostsForHashRate(hashRate).map((row) => [row.slug, row.required]));
}

test("hashrate bands are inclusive at the named ceilings", () => {
  assert.equal(prices.priceBandForHashRate(0), "starter");
  assert.equal(prices.priceBandForHashRate(30), "starter");
  assert.equal(prices.priceBandForHashRate(30.01), "mid");
  assert.equal(prices.priceBandForHashRate(100), "mid");
  assert.equal(prices.priceBandForHashRate(100.01), "high");
  assert.equal(prices.priceBandForHashRate(1000), "high");
  assert.equal(prices.priceBandForHashRate(1000.01), "elite");
  assert.equal(prices.priceBandForHashRate(Number.NaN), "starter");
});

test("starter recipe is cable, chip, fan and thermal paste", () => {
  assert.deepEqual(requiredMap(10), {
    power_cable: 2,
    asic_chip: 1,
    cooling_fan: 1,
    thermal_pad: 1,
  });
});

test("mid recipe adds a hashboard and a power supply", () => {
  assert.deepEqual(requiredMap(100), {
    power_cable: 2,
    asic_chip: 2,
    cooling_fan: 1,
    hashboard: 1,
    power_supply: 1,
  });
});

test("high and elite recipes match the named part counts", () => {
  assert.deepEqual(requiredMap(1000), {
    power_cable: 3,
    asic_chip: 4,
    cooling_fan: 2,
    hashboard: 2,
    power_supply: 1,
    thermal_pad: 1,
  });
  assert.deepEqual(requiredMap(1500), {
    power_cable: 4,
    asic_chip: 8,
    cooling_fan: 2,
    hashboard: 3,
    power_supply: 2,
    thermal_pad: 2,
  });
});
