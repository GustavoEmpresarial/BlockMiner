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
