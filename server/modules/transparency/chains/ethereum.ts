// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ethereum mainnet (chainId 1) — ported from legacy/server/services/chains/ethereum.ts. */
const ethereum = {
    chainId: 1,
    name: "ethereum",
    nativeSymbol: "ETH",
    nativePriceKey: "eth",
    explorerBase: "https://etherscan.io",
    rpcUrl: process.env.ETHEREUM_RPC_URL || "https://ethereum.publicnode.com",
    uniV3NfpmAddress: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    uniV3FactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    knownTokens: [
        { contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", name: "USD Coin", decimals: 6, priceKey: "stable" },
        { contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT", name: "Tether USD", decimals: 6, priceKey: "stable" },
        { contractAddress: "0x6b175474e89094c44da98b954eedeac495271d0f", symbol: "DAI", name: "Dai", decimals: 18, priceKey: "stable" },
        { contractAddress: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", symbol: "WBTC", name: "Wrapped BTC", decimals: 8, priceKey: "btc" },
        { contractAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18, priceKey: "eth" },
    ],
};
export default ethereum;
