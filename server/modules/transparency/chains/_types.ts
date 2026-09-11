// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Shared types for per-chain wallet-snapshot configuration.
 * Ported from legacy/server/services/chains/_types.ts (doctrine: one file per network,
 * `index.ts` re-exports the registry — see chains/index.ts).
 */
export type KnownToken = {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  priceKey: string;
};

export type ChainConfig = {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativePriceKey: string;
  explorerBase: string;
  rpcUrl: string;
  uniV3NfpmAddress?: string;
  uniV3FactoryAddress?: string;
  knownTokens: KnownToken[];
};
