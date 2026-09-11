import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Prefer compiled JS after `npm run build`; fall back to tsx register if present.
let isValidSwapPair;
try {
  ({ isValidSwapPair } = require("../../dist/server/modules/swap/swap.pairs.js"));
} catch {
  const tsx = await import("tsx/esm/api").catch(() => null);
  if (tsx?.register) tsx.register();
  ({ isValidSwapPair } = await import("../../server/modules/swap/swap.pairs.ts"));
}

const swapSchema = z
  .object({
    fromAsset: z.enum(["POL", "SHIB"]),
    toAsset: z.literal("BLK"),
    amount: z.union([z.string().trim(), z.number()]),
  })
  .strict();

test("isValidSwapPair accepts only POL→BLK and SHIB→BLK", () => {
  assert.equal(isValidSwapPair("POL", "BLK"), true);
  assert.equal(isValidSwapPair("SHIB", "BLK"), true);
});

test("isValidSwapPair rejects withdrawable and reverse pairs", () => {
  assert.equal(isValidSwapPair("BLK", "POL"), false);
  assert.equal(isValidSwapPair("BLK", "SHIB"), false);
  assert.equal(isValidSwapPair("SHIB", "POL"), false);
  assert.equal(isValidSwapPair("POL", "SHIB"), false);
  assert.equal(isValidSwapPair("POL", "USDC"), false);
  assert.equal(isValidSwapPair("USDC", "POL"), false);
  assert.equal(isValidSwapPair(undefined, undefined), false);
});

test("swapSchema accepts POL→BLK and SHIB→BLK", () => {
  assert.equal(swapSchema.safeParse({ fromAsset: "POL", toAsset: "BLK", amount: 5 }).success, true);
  assert.equal(swapSchema.safeParse({ fromAsset: "SHIB", toAsset: "BLK", amount: "1000" }).success, true);
});

test("swapSchema rejects BLK outbound and legacy pairs", () => {
  assert.equal(swapSchema.safeParse({ fromAsset: "BLK", toAsset: "POL", amount: 1 }).success, false);
  assert.equal(swapSchema.safeParse({ fromAsset: "POL", toAsset: "USDC", amount: 1 }).success, false);
  assert.equal(swapSchema.safeParse({ fromAsset: "POL", toAsset: "BLK", amount: 1, extra: true }).success, false);
});
