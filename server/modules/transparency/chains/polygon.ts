import type { ChainConfig } from "./_types.js";

/**
 * Polygon PoS (chainId 137) — primary chain, ported from legacy/server/services/chains/polygon.ts.
 * NFT/tx-history discovery (Etherscan-backed in legacy) was NOT ported — see
 * transparency.wallet-snapshot.service.ts header comment. Known-token balances + native
 * balance + Uniswap V3 LP valuation all use only the public read-only RPC below.
 */
const polygon: ChainConfig = {
  chainId: 137,
  name: "polygon",
  nativeSymbol: "POL",
  nativePriceKey: "pol",
  explorerBase: "https://polygonscan.com",
  rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com",
  uniV3NfpmAddress:    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  uniV3FactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  knownTokens: [
    { contractAddress: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", symbol: "USDC",   name: "USD Coin",       decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", symbol: "USDC.e", name: "Bridged USDC",   decimals: 6,  priceKey: "stable" },
    { contractAddress: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", symbol: "USDT",   name: "Tether USD",     decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", symbol: "DAI",    name: "Dai Stablecoin", decimals: 18, priceKey: "stable" },
    { contractAddress: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", symbol: "WBTC",   name: "Wrapped BTC",    decimals: 8,  priceKey: "btc"    },
    { contractAddress: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", symbol: "WETH",   name: "Wrapped Ether",  decimals: 18, priceKey: "eth"    },
  ],
};

export default polygon;
