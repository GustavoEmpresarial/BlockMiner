export type SwapFromAsset = "POL" | "SHIB";
export type SwapToAsset = "BLK";

/** Allowed swap pairs — no DB imports (unit-testable). */
export const VALID_SWAP_PAIRS: ReadonlyArray<readonly [SwapFromAsset, SwapToAsset]> = [
  ["POL", "BLK"],
  ["SHIB", "BLK"],
] as const;

export function isValidSwapPair(fromAsset: unknown, toAsset: unknown): fromAsset is SwapFromAsset {
  return VALID_SWAP_PAIRS.some(([f, t]) => f === fromAsset && t === toAsset);
}
