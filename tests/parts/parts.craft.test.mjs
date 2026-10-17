import test from "node:test";
import assert from "node:assert/strict";
import {
  PARTS_CRAFT_RATIO,
  getNextPartRarity,
} from "../../server/modules/parts/parts.craft.ts";

test("parts.craft: getNextPartRarity advances through all tiers", () => {
  assert.equal(getNextPartRarity("common"), "uncommon");
  assert.equal(getNextPartRarity("uncommon"), "rare");
  assert.equal(getNextPartRarity("rare"), "epic");
  assert.equal(getNextPartRarity("epic"), "legendary");
  assert.equal(getNextPartRarity("legendary"), null);
});

test("parts.craft: PARTS_CRAFT_RATIO is exactly 5", () => {
  assert.equal(PARTS_CRAFT_RATIO, 5);
});
