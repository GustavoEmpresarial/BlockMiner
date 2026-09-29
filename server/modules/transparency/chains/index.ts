/**
 * Chain registry for the multi-chain wallet snapshot — ported from
 * legacy/server/services/chains/index.ts. One file per network; a failure reading/calling one
 * chain's RPC never affects the others (isolated via Promise.allSettled in
 * transparency.wallet-snapshot.service.ts).
 *
 * PORTED (3/7 legacy chains): polygon, ethereum, bsc — all use free public RPCs, no API key.
 * NOT PORTED (documented, not fabricated): arbitrum, base, optimism, avalanche. Legacy's
 * per-chain fetch logic for these is identical (same generic RPC + Uniswap-V3-fork LP code
 * path) — they were left out only to keep this pass's scope reviewable, not because of any
 * blocker. Adding one is: create `<chain>.ts` following polygon.ts/bsc.ts's shape, import it
 * here, push it into CHAINS.
 */
import ethereum from "./ethereum.js";
import polygon from "./polygon.js";
import bsc from "./bsc.js";
import type { ChainConfig } from "./_types.js";

export type { ChainConfig, KnownToken } from "./_types.js";
export const CHAINS: ChainConfig[] = [
    ethereum,
    polygon,
    bsc,
];
