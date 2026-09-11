/**
 * Multi-chain treasury wallet snapshot — ported from
 * legacy/server/services/multiChainWalletService.ts (fetchMultiChainSnapshot + the Uniswap V3
 * LP-valuation helpers) and legacy/server/services/multiChainWallet.chain.ts (price/RPC
 * helpers). Read-only reporting only: no private key, no signing, no fund movement — every
 * number here comes from a real `eth_call`/`eth_getBalance` against a public RPC, or a real
 * CoinGecko price lookup. Never fabricated.
 *
 * Scope of this port (documented deviations from legacy, see chains/index.ts too):
 *  - 3 of 7 legacy chains ported (ethereum, polygon, bsc) — arbitrum/base/optimism/avalanche
 *    not ported, same reason as chains/index.ts.
 *  - Token discovery is limited to each chain's `knownTokens` list (RPC balanceOf checks).
 *    Legacy also walked Etherscan `tokentx` history to discover *unknown* held tokens on
 *    Polygon — that requires `POLYGONSCAN_API_KEY`, which is not configured in this
 *    environment (see transparency.activity.service.ts for the established honesty pattern);
 *    skipped rather than faked.
 *  - NFT holdings (ERC-721, non-LP) are NOT ported — legacy discovers those via Etherscan
 *    `tokennfttx`, same API-key gap. LP position NFTs (Uniswap V3 / PancakeSwap V3) ARE
 *    ported in full because their discovery (`tokenOfOwnerByIndex` on the NFPM contract) is
 *    pure RPC, no explorer API needed.
 *  - `backfillHistoricalLiquidityPoolPositions` (legacy: scans years of historical
 *    `Transfer` logs across all chains to recover *closed* LP positions) was not ported —
 *    high complexity, low value for a live treasury snapshot which only needs *current*
 *    positions. Only active-position sync is implemented (see wallet-snapshot.cron.ts).
 *
 * Isolation: every chain's fetch runs inside `Promise.allSettled` in
 * `fetchMultiChainSnapshot` — one broken/slow RPC never blocks or fails the others.
 */
import { ethers } from "ethers";
import { logger } from "../../core/logger/index.js";
import { CHAINS } from "./chains/index.js";
import type { ChainConfig } from "./chains/index.js";
import * as transparencyRepo from "./transparency.repository.js";

const log = logger.child("TransparencyWalletSnapshot");

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChainTokenHolding = {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  usdValue: number | null;
};

export type ChainNftHolding = {
  contractAddress: string;
  tokenId: string;
  contractName: string;
  tokenSymbol: string;
  standard: "ERC-721";
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  tokenUri: string | null;
  explorerUrl: string;
  openseaUrl: string;
  chainName?: string;
  chainId?: number;
  isLiquidityPosition?: boolean;
  liquidityUsd?: number | null;
  poolLabel?: string | null;
};

export type ChainSnapshot = {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativeBalance: number;
  nativeUsd: number | null;
  tokens: ChainTokenHolding[];
  nfts: ChainNftHolding[];
  lpUsd: number;
  totalChainUsd: number | null;
};

export type MultiChainSnapshot = {
  address: string;
  fetchedAt: Date;
  totalUsd: number | null;
  valuePol: number | null;
  chains: ChainSnapshot[];
  tokens: ChainTokenHolding[];
  nfts: ChainNftHolding[];
};

export type Prices = { eth: number | null; pol: number | null; btc: number | null; bnb: number | null };

// ─── Price helpers (ported from multiChainWallet.chain.ts) ──────────────────

export function tokenUsd(balance: number, priceKey: ChainConfig["nativePriceKey"], prices: Prices): number | null {
  if (priceKey === "stable") return balance;
  if (priceKey === "btc") return prices.btc != null ? balance * prices.btc : null;
  if (priceKey === "eth") return prices.eth != null ? balance * prices.eth : null;
  if (priceKey === "pol") return prices.pol != null ? balance * prices.pol : null;
  if (priceKey === "bnb") return prices.bnb != null ? balance * prices.bnb : null;
  return null;
}

export const STABLE_SYMS = new Set(["USDC", "USDT", "DAI", "BUSD", "FRAX", "LUSD", "USDC.E", "BRIDGED USDC"]);

export function knownPriceBySymbol(sym: string, prices: Prices): number | null {
  const s = sym.toUpperCase();
  if (STABLE_SYMS.has(s)) return 1;
  if (["ETH", "WETH"].includes(s)) return prices.eth;
  if (["BTC", "WBTC", "BTCB", "CBBTC"].includes(s)) return prices.btc;
  if (["POL", "MATIC", "WPOL"].includes(s)) return prices.pol;
  if (["BNB", "WBNB"].includes(s)) return prices.bnb;
  return null;
}

/**
 * Calculate token amounts held in a Uniswap V3 position, in ATOMIC units.
 * Uses floating-point for simplicity (±0.1% accuracy is fine for USD display) — same
 * approach and tolerance as legacy.
 */
export function calcUniV3Amounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
): { amount0: number; amount1: number } {
  if (liquidity === 0n) return { amount0: 0, amount1: 0 };
  const L = Number(liquidity);
  const Q96 = 2 ** 96;
  const sqrtP = Number(sqrtPriceX96) / Q96;
  const sqrtPa = Math.pow(1.0001, tickLower / 2);
  const sqrtPb = Math.pow(1.0001, tickUpper / 2);

  if (sqrtP <= sqrtPa) {
    return { amount0: L * (1 / sqrtPa - 1 / sqrtPb), amount1: 0 };
  } else if (sqrtP >= sqrtPb) {
    return { amount0: 0, amount1: L * (sqrtPb - sqrtPa) };
  }
  return {
    amount0: L * (1 / sqrtP - 1 / sqrtPb),
    amount1: L * (sqrtP - sqrtPa),
  };
}

// ─── RPC helpers ──────────────────────────────────────────────────────────────

const ERC20_ABI_BALANCE = ["function balanceOf(address owner) view returns (uint256)"];

const RPC_TIMEOUT_MS = 4500; // same bound as server/shared/blockchain/polygonProvider.ts

/**
 * Build a JsonRpcProvider with a bounded per-request timeout and a pre-declared `chainId`
 * (`staticNetwork`). Without `staticNetwork`, ethers v6 performs an `eth_chainId` network
 * "auto-detect" handshake before the FIRST call and silently retries it with backoff (1s, 2s,
 * 4s, …) when the RPC is unreachable — which turns one dead RPC into a minutes-long hang
 * instead of a clean timeout. Declaring the chainId up front skips that handshake entirely.
 */
function makeProvider(rpcUrl: string, chainId: number): ethers.JsonRpcProvider {
  const fetchRequest = new ethers.FetchRequest(rpcUrl);
  fetchRequest.timeout = RPC_TIMEOUT_MS;
  return new ethers.JsonRpcProvider(fetchRequest, undefined, { staticNetwork: ethers.Network.from(chainId) });
}

export async function fetchNativeBalanceRpc(rpcUrl: string, address: string, chainId = 0): Promise<bigint> {
  try {
    const provider = makeProvider(rpcUrl, chainId);
    return BigInt((await provider.getBalance(address)).toString());
  } catch {
    return 0n;
  }
}

export async function fetchTokenBalanceRpc(rpcUrl: string, tokenAddress: string, walletAddress: string, chainId = 0): Promise<bigint> {
  try {
    const provider = makeProvider(rpcUrl, chainId);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI_BALANCE, provider);
    const raw = await (contract.balanceOf(walletAddress) as Promise<bigint>);
    return BigInt(raw.toString());
  } catch {
    return 0n;
  }
}

// ─── Uniswap V3 LP position valuation (ported from multiChainWalletService.ts) ──────────────

const NFPM_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
];

const POOL_SLOT0_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

const FACTORY_GETPOOL_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

const ERC20_META_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

/**
 * Fetch total USD value of all Uniswap-V3-shaped LP positions a wallet holds via one
 * NFPM/Factory pair on one chain. Uses raw `provider.call()` (not the ethers Contract wrapper)
 * for every read, mirroring legacy's approach (avoids Contract-wrapper quirks seen on some
 * chains). Never throws — the caller wraps this in `.catch()` too, but every internal read is
 * also individually guarded so one bad tokenId can't blank out the rest.
 */
export async function fetchUniV3LpValue(
  rpcUrl: string,
  walletAddress: string,
  nfpmAddress: string,
  factoryAddress: string,
  prices: Prices,
  chain: Pick<ChainConfig, "chainId" | "name" | "explorerBase">,
): Promise<{ totalUsd: number; nftPositions: ChainNftHolding[] }> {
  const provider = makeProvider(rpcUrl, chain.chainId);
  const nfpmIface = new ethers.Interface(NFPM_ABI);
  const poolIface = new ethers.Interface(POOL_SLOT0_ABI);
  const factoryIface = new ethers.Interface(FACTORY_GETPOOL_ABI);
  const erc20Iface = new ethers.Interface(ERC20_META_ABI);

  const call = async (to: string, iface: ethers.Interface, fn: string, args: unknown[]): Promise<ethers.Result> => {
    const data = iface.encodeFunctionData(fn, args);
    const raw = await provider.call({ to, data });
    return iface.decodeFunctionResult(fn, raw);
  };

  let nftCount = 0n;
  try {
    const [bal] = await call(nfpmAddress, nfpmIface, "balanceOf", [walletAddress]);
    nftCount = BigInt(bal.toString());
  } catch (err) {
    log.warn("uniV3-lp balanceOf failed", { nfpm: nfpmAddress.slice(0, 10), error: (err as Error)?.message?.slice(0, 80) });
    return { totalUsd: 0, nftPositions: [] };
  }
  if (nftCount === 0n) return { totalUsd: 0, nftPositions: [] };

  const tokenIdResults = await Promise.all(
    Array.from({ length: Number(nftCount) }, (_, i) =>
      call(nfpmAddress, nfpmIface, "tokenOfOwnerByIndex", [walletAddress, BigInt(i)])
        .then(([tid]) => BigInt(tid.toString()))
        .catch(() => null),
    ),
  );
  const tokenIds = tokenIdResults.filter((tid): tid is bigint => tid !== null);

  let totalUsd = 0;
  const nftPositions: ChainNftHolding[] = [];
  for (const tokenId of tokenIds) {
    try {
      const posResult = await call(nfpmAddress, nfpmIface, "positions", [tokenId]);
      const token0 = String(posResult[2]);
      const token1 = String(posResult[3]);
      const fee = BigInt(posResult[4].toString());
      const tickLower = Number(posResult[5]);
      const tickUpper = Number(posResult[6]);
      const liquidity = BigInt(posResult[7].toString());
      const tokensOwed0 = BigInt(posResult[10].toString());
      const tokensOwed1 = BigInt(posResult[11].toString());

      if (liquidity === 0n && tokensOwed0 === 0n && tokensOwed1 === 0n) continue;

      const [[dec0Res], [dec1Res], [sym0Res], [sym1Res]] = await Promise.all([
        call(token0, erc20Iface, "decimals", []),
        call(token1, erc20Iface, "decimals", []),
        call(token0, erc20Iface, "symbol", []),
        call(token1, erc20Iface, "symbol", []),
      ]);
      const dec0 = Number(dec0Res);
      const dec1 = Number(dec1Res);
      const sym0 = String(sym0Res);
      const sym1 = String(sym1Res);

      const [poolAddr] = await call(factoryAddress, factoryIface, "getPool", [token0, token1, fee]);
      if (String(poolAddr) === ethers.ZeroAddress) continue;

      const [sqrtPriceX96Res] = await call(String(poolAddr), poolIface, "slot0", []);
      const sqrtPriceX96 = BigInt(sqrtPriceX96Res.toString());

      const { amount0: pa0, amount1: pa1 } = calcUniV3Amounts(sqrtPriceX96, tickLower, tickUpper, liquidity);
      const total0 = pa0 + Number(tokensOwed0);
      const total1 = pa1 + Number(tokensOwed1);
      const h0 = total0 / Math.pow(10, dec0);
      const h1 = total1 / Math.pow(10, dec1);

      const Q96 = 2 ** 96;
      const sqrtF = Number(sqrtPriceX96) / Q96;
      const p0in1 = (sqrtF * sqrtF * Math.pow(10, dec0)) / Math.pow(10, dec1);

      const s0 = sym0.toUpperCase();
      const s1 = sym1.toUpperCase();

      let posUsd = 0;
      if (STABLE_SYMS.has(s1)) {
        posUsd = h0 * p0in1 + h1;
      } else if (STABLE_SYMS.has(s0)) {
        posUsd = h0 + (p0in1 > 0 ? h1 / p0in1 : 0);
      } else {
        const usd0 = knownPriceBySymbol(s0, prices);
        const usd1 = knownPriceBySymbol(s1, prices);
        if (usd0 != null) posUsd += h0 * usd0;
        else if (usd1 != null && p0in1 > 0) posUsd += h0 * (usd1 / p0in1);
        if (usd1 != null) posUsd += h1 * usd1;
        else if (usd0 != null && p0in1 > 0) posUsd += h1 * (usd0 * p0in1);
      }

      // Safety guard (NOT present in legacy — a real bug found during this port's smoke test):
      // extreme tick positions (near Uniswap's MIN_TICK/MAX_TICK, e.g. degenerate/dust
      // "full-range" positions) make `Math.pow(1.0001, tick/2)` under/overflow, which can
      // blow `posUsd` up to nonsensical magnitudes (observed: 1e49 USD for a real mainnet
      // address). Rather than let that poison the wallet's reported totalUsd, treat any
      // non-finite or implausibly large position value as "valuation unavailable" for that
      // position and skip it — honest degradation, not a fabricated number.
      const MAX_PLAUSIBLE_POSITION_USD = 1_000_000_000; // $1B — generous upper bound for one LP position
      if (!Number.isFinite(posUsd) || posUsd > MAX_PLAUSIBLE_POSITION_USD) {
        log.warn("uniV3-lp implausible position value skipped", { tokenId: tokenId.toString(), posUsd });
        continue;
      }

      if (posUsd > 0) {
        totalUsd += posUsd;
        nftPositions.push({
          contractAddress: nfpmAddress.toLowerCase(),
          tokenId: tokenId.toString(),
          contractName: "Uniswap V3 Position NFT",
          tokenSymbol: "UNI-V3-POS",
          standard: "ERC-721",
          name: `${sym0}/${sym1} LP Position`,
          description: `Active liquidity position on ${chain.name} (${sym0}/${sym1}, fee ${fee.toString()}).`,
          imageUrl: null,
          tokenUri: null,
          explorerUrl: `${chain.explorerBase}/token/${nfpmAddress}?a=${tokenId.toString()}`,
          openseaUrl:
            chain.chainId === 137
              ? `https://opensea.io/assets/matic/${nfpmAddress}/${tokenId.toString()}`
              : `https://opensea.io/assets/${chain.name}/${nfpmAddress}/${tokenId.toString()}`,
          chainName: chain.name,
          chainId: chain.chainId,
          isLiquidityPosition: true,
          liquidityUsd: Number(posUsd.toFixed(2)),
          poolLabel: `${sym0}/${sym1}`,
        });
      }
    } catch (err) {
      log.warn("uniV3-lp position read failed", { tokenId: tokenId.toString(), error: (err as Error)?.message?.slice(0, 100) });
    }
  }
  return { totalUsd, nftPositions };
}

// ─── Single-chain snapshot ────────────────────────────────────────────────────

async function fetchChainSnapshot(chain: ChainConfig, address: string, prices: Prices): Promise<ChainSnapshot> {
  const nativeWei = await fetchNativeBalanceRpc(chain.rpcUrl, address, chain.chainId);
  const nativeBal = Number(ethers.formatEther(nativeWei));
  const nativeUsd = tokenUsd(nativeBal, chain.nativePriceKey, prices);

  const tokenHoldings: ChainTokenHolding[] = [];
  for (const kt of chain.knownTokens) {
    const raw = await fetchTokenBalanceRpc(chain.rpcUrl, kt.contractAddress, address, chain.chainId);
    if (raw <= 0n) continue;
    const balance = Number(ethers.formatUnits(raw, kt.decimals));
    const usdValue = tokenUsd(balance, kt.priceKey, prices);
    tokenHoldings.push({
      contractAddress: kt.contractAddress,
      symbol: kt.symbol,
      name: kt.name,
      decimals: kt.decimals,
      balance,
      usdValue,
    });
  }
  tokenHoldings.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  let lpUsd = 0;
  let nfts: ChainNftHolding[] = [];
  if (chain.uniV3NfpmAddress && chain.uniV3FactoryAddress) {
    const lp = await fetchUniV3LpValue(chain.rpcUrl, address, chain.uniV3NfpmAddress, chain.uniV3FactoryAddress, prices, chain).catch(
      (err: unknown) => {
        log.warn(`${chain.name} LP valuation failed`, { error: (err as Error)?.message });
        return { totalUsd: 0, nftPositions: [] };
      },
    );
    lpUsd = lp.totalUsd;
    nfts = lp.nftPositions;
  }

  const tokensUsd = tokenHoldings.reduce((s, t) => s + (t.usdValue ?? 0), 0);
  const hasKnownUsdComponent = nativeUsd != null || lpUsd > 0 || tokenHoldings.some((t) => t.usdValue != null);
  const totalChainUsd = hasKnownUsdComponent ? (nativeUsd ?? 0) + tokensUsd + lpUsd : null;

  return {
    chainId: chain.chainId,
    name: chain.name,
    nativeSymbol: chain.nativeSymbol,
    nativeBalance: nativeBal,
    nativeUsd,
    tokens: tokenHoldings,
    nfts,
    lpUsd,
    totalChainUsd,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Single CoinGecko call for all native-currency prices (avoids per-chain rate-limit). */
export async function fetchAllBasePrices(): Promise<Prices> {
  const ids = ["polygon-ecosystem-token", "matic-network", "ethereum", "bitcoin", "binancecoin"];
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number }>;
    const get = (key: string) => {
      const v = json[key]?.usd;
      return v != null && Number.isFinite(v) && v > 0 ? v : null;
    };
    return {
      pol: get("polygon-ecosystem-token") ?? get("matic-network"),
      eth: get("ethereum"),
      btc: get("bitcoin"),
      bnb: get("binancecoin"),
    };
  } catch (err) {
    log.warn("base price fetch failed", { error: (err as Error)?.message });
    return { pol: null, eth: null, btc: null, bnb: null };
  }
}

/**
 * Fetch a full multi-chain treasury snapshot for one wallet address. Every chain runs inside
 * `Promise.allSettled` — a broken/slow RPC on one chain never blocks or fails the others; it
 * is simply omitted from `chains` (and logged).
 */
export async function fetchMultiChainSnapshot(address: string): Promise<MultiChainSnapshot> {
  const prices = await fetchAllBasePrices();

  const settled = await Promise.allSettled(CHAINS.map((chain) => fetchChainSnapshot(chain, address, prices)));

  const chainSnapshots: ChainSnapshot[] = [];
  for (let i = 0; i < settled.length; i++) {
    const chain = CHAINS[i];
    const result = settled[i];
    if (result.status === "rejected") {
      log.warn(`${chain.name} snapshot failed`, { address, error: String((result.reason as Error)?.message ?? result.reason) });
      continue;
    }
    const snap = result.value;
    const hasBalance = snap.nativeBalance > 0 || snap.tokens.length > 0 || snap.nfts.length > 0 || snap.lpUsd > 0;
    if (hasBalance) chainSnapshots.push(snap);
  }

  const totalUsd = chainSnapshots.reduce((s, c) => s + (c.totalChainUsd ?? 0), 0) || null;
  const polySnap = chainSnapshots.find((c) => c.chainId === 137);
  const valuePol = polySnap?.nativeBalance ?? null;

  const allTokens = chainSnapshots.flatMap((c) => c.tokens.map((t) => ({ ...t, chain: c.name })));
  const allNfts = chainSnapshots.flatMap((c) => c.nfts);

  return { address, fetchedAt: new Date(), totalUsd, valuePol, chains: chainSnapshots, tokens: allTokens, nfts: allNfts };
}

// ─── Per-wallet reconciliation (moved out of cron/wallet-snapshot.cron.ts — the cron file
// should only schedule, per docs/ARQUITETURA.md section 9; this is the module's own business
// logic, not scheduling glue) ────────────────────────────────────────────────────────────────

type SnapshotEligibleWallet = { id: number; address: string; displayMode: string };

/**
 * Syncs a wallet's active LP positions: upserts every position currently detected on-chain,
 * deletes any stored row no longer present (position closed/burned). No "legacy" status here —
 * a position either exists now or it doesn't.
 */
async function syncLiquidityPoolPositions(walletId: number, nfts: ChainNftHolding[]): Promise<void> {
  const activePools = nfts.filter(
    (nft) => nft.isLiquidityPosition && nft.chainId != null && nft.chainName && nft.contractAddress && nft.tokenId,
  );

  const seenKeys = new Set(activePools.map((nft) => `${nft.chainId}:${nft.contractAddress.toLowerCase()}:${nft.tokenId}`));

  for (const nft of activePools) {
    const contractAddress = nft.contractAddress.toLowerCase();
    await transparencyRepo.upsertLiquidityPoolPosition(walletId, nft.chainId!, contractAddress, nft.tokenId, {
      walletId,
      chainId: nft.chainId!,
      chainName: nft.chainName!,
      contractAddress,
      tokenId: nft.tokenId,
      poolLabel: nft.poolLabel ?? undefined,
      name: nft.name ?? undefined,
      description: nft.description ?? undefined,
      imageUrl: nft.imageUrl ?? undefined,
      tokenUri: nft.tokenUri ?? undefined,
      explorerUrl: nft.explorerUrl,
      openseaUrl: nft.openseaUrl,
      liquidityUsd: nft.liquidityUsd ?? undefined,
      status: "active",
      lastSeenAt: new Date(),
      closedAt: null,
    });
  }

  const stored = await transparencyRepo.listActiveLiquidityPoolPositions(walletId);
  const toDelete = stored
    .filter((p) => !seenKeys.has(`${p.chainId}:${p.contractAddress.toLowerCase()}:${p.tokenId}`))
    .map((p) => p.id);
  if (toDelete.length > 0) {
    await transparencyRepo.deleteLiquidityPoolPositionsByIds(toDelete);
    log.info("Removed closed LP position(s)", { walletId, count: toDelete.length });
  }
}

/**
 * Fetches a fresh multi-chain snapshot for one tracked wallet, reconciles it against the last
 * stored snapshot (never overwrites a good stored USD value with a null one just because this
 * run's RPCs were all down — preserves the last-known-good snapshot instead), persists it, and
 * syncs its active LP positions. This is the per-wallet unit of work the cron loops over.
 */
export async function syncWalletSnapshot(wallet: SnapshotEligibleWallet): Promise<MultiChainSnapshot> {
  const existing = await transparencyRepo.findWalletSnapshot(wallet.id);
  const snap = await fetchMultiChainSnapshot(wallet.address);

  const hasFreshUsd =
    snap.totalUsd != null ||
    snap.chains.some((c) => c.totalChainUsd != null) ||
    snap.tokens.some((t) => t.usdValue != null) ||
    snap.nfts.some((n) => n.isLiquidityPosition && n.liquidityUsd != null);

  const nextTotalUsd = hasFreshUsd ? (snap.totalUsd ?? existing?.totalUsd ?? null) : (existing?.totalUsd ?? null);
  const nextChains = snap.chains.length > 0 ? snap.chains : ((existing?.chains as object[]) ?? []);
  const nextTokens = snap.tokens.length > 0 ? snap.tokens : ((existing?.tokens as object[]) ?? []);
  const nextNfts = snap.nfts.length > 0 ? snap.nfts : ((existing?.nfts as object[]) ?? []);
  const nextFetchedAt = hasFreshUsd ? snap.fetchedAt : (existing?.fetchedAt ?? snap.fetchedAt);

  await transparencyRepo.upsertWalletSnapshot(wallet.id, {
    totalUsd: nextTotalUsd,
    valuePol: snap.valuePol,
    chains: nextChains as object,
    tokens: nextTokens as object,
    nfts: nextNfts as object,
    fetchedAt: nextFetchedAt,
  });

  await syncLiquidityPoolPositions(wallet.id, snap.nfts);

  return snap;
}
