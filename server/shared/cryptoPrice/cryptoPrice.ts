/**
 * Live crypto/USD price fetching, shared across modules (wallet, swap, moneyrain, offerwallme).
 *
 * Ported from legacy/server/shared/cryptoPrice.ts. Lives under shared/ (not owned by a single
 * domain module) for the same reason as shared/calendar/utcCalendar.ts: it's cross-domain
 * infrastructure, not business logic that belongs to one module.
 *
 * Previously this logic was duplicated independently in wallet/balance/balance.service.ts and
 * swap/swap.service.ts, each with its own cache and a simplified single-provider fetch (CoinGecko
 * only, no fallback). Consolidated here with the legacy's full fallback chain restored:
 *   POL:  CoinGecko(polygon-ecosystem-token) -> CoinGecko(matic-network) -> Binance(POLUSDT) -> Binance(MATICUSDT)
 *   SHIB: CoinGecko(shiba-inu) -> Binance(SHIBUSDT)
 *   BTC/ETH: CoinGecko only (matches legacy — no Binance fallback was ported for these there either)
 * wallet/index.ts and swap/index.ts still export getPolUsdPrice/getShibUsdPrice from their own
 * public API (re-exporting from here), so no consumer import needs to change.
 */
const PRICE_TTL_MS = 2 * 60 * 1000;
const priceCache = new Map<string, { price: number; timestamp: number }>();
const inflightFetches = new Map<string, Promise<number>>();
// --- Historical pricing (ported from legacy/server/shared/cryptoPrice.ts) ---
// Keyed by calendar date (UTC) instead of a TTL — a historical price for a given day never
// changes, so once fetched it is cached forever (process lifetime).
const historicalPriceCache = new Map<string, number>();
const inflightHistoricalFetches = new Map<string, Promise<number>>();
/** Stale price used only if the cache has never been populated AND every provider fails. */
const HARD_FALLBACK = {
    POL: 0.09,
    SHIB: 0.0000055,
    BTC: 0,
    ETH: 0,
};
async function fetchCoinGeckoPrice(id: string): Promise<number | null> {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
        throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const price = data[id]?.usd;
    return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
}
async function fetchBinanceTickerPrice(symbol: string): Promise<number | null> {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, {
        signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok)
        throw new Error(`Binance HTTP ${res.status}`);
    const data = (await res.json());
    const price = Number(data?.price);
    return Number.isFinite(price) && price > 0 ? price : null;
}
async function getCachedPrice(cacheKey: string, fetcher: () => Promise<number | null>): Promise<number> {
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PRICE_TTL_MS)
        return cached.price;
    const inflight = inflightFetches.get(cacheKey);
    if (inflight)
        return inflight;
    const fetchPromise = (async () => {
        try {
            const price = await fetcher();
            if (price != null) {
                priceCache.set(cacheKey, { price, timestamp: Date.now() });
                return price;
            }
        }
        catch {
            /* fall through to stale cache / hard fallback below */
        }
        if (cached)
            return cached.price;
        return (HARD_FALLBACK as Record<string, number>)[cacheKey] ?? 0;
    })();
    inflightFetches.set(cacheKey, fetchPromise);
    try {
        return await fetchPromise;
    }
    finally {
        inflightFetches.delete(cacheKey);
    }
}
/** POL/USD with the full legacy fallback chain: CoinGecko (2 ids) -> Binance (2 symbols). */
export async function getPolUsdPrice() {
    return getCachedPrice("POL", async () => {
        let price = await fetchCoinGeckoPrice("polygon-ecosystem-token").catch(() => null);
        if (!price)
            price = await fetchCoinGeckoPrice("matic-network").catch(() => null);
        if (!price)
            price = await fetchBinanceTickerPrice("POLUSDT").catch(() => null);
        if (!price)
            price = await fetchBinanceTickerPrice("MATICUSDT").catch(() => null);
        return price;
    });
}
/** SHIB/USD with fallback: CoinGecko -> Binance. */
export async function getShibUsdPrice() {
    return getCachedPrice("SHIB", async () => {
        let price = await fetchCoinGeckoPrice("shiba-inu").catch(() => null);
        if (!price)
            price = await fetchBinanceTickerPrice("SHIBUSDT").catch(() => null);
        return price;
    });
}
/** BTC/USD, CoinGecko only (matches legacy — no Binance fallback ported for this asset). */
export async function getBtcUsdPrice() {
    return getCachedPrice("BTC", () => fetchCoinGeckoPrice("bitcoin"));
}
/** ETH/USD, CoinGecko only (matches legacy — no Binance fallback ported for this asset). */
export async function getEthUsdPrice() {
    return getCachedPrice("ETH", () => fetchCoinGeckoPrice("ethereum"));
}
function toHistoryDateParam(timestampSec: number): string {
    const d = new Date(timestampSec * 1000);
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = String(d.getUTCFullYear());
    return `${day}-${month}-${year}`;
}
async function fetchCoinGeckoHistoricalPrice(id: string, timestampSec: number): Promise<number | null> {
    const date = toHistoryDateParam(timestampSec);
    const res = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/history?date=${date}&localization=false`, {
        signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok)
        throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = (await res.json());
    return data?.market_data?.current_price?.usd ?? null;
}
async function getHistoricalCachedPrice(cacheKey: string, timestampSec: number, fetcher: () => Promise<number | null>): Promise<number> {
    const dateKey = toHistoryDateParam(timestampSec);
    const cacheId = `${cacheKey}:${dateKey}`;
    const cached = historicalPriceCache.get(cacheId);
    if (cached != null)
        return cached;
    const inflight = inflightHistoricalFetches.get(cacheId);
    if (inflight)
        return inflight;
    const fetchPromise = (async () => {
        const price = await fetcher();
        if (price != null) {
            historicalPriceCache.set(cacheId, price);
            return price;
        }
        throw new Error(`Could not resolve historical ${cacheKey} price for ${dateKey}.`);
    })();
    inflightHistoricalFetches.set(cacheId, fetchPromise);
    try {
        return await fetchPromise;
    }
    finally {
        inflightHistoricalFetches.delete(cacheId);
    }
}
/**
 * POL/USD at a specific past moment (CoinGecko `/coins/{id}/history`, day-granularity — that
 * endpoint has no intraday resolution). Used only for immutable deposit valuation at on-chain
 * confirmation time (see modules/pricing). No hard fallback: an unresolved historical price must
 * fail loudly (the caller retries) rather than silently credit a wrong USD value.
 */
export async function getPolUsdPriceAt(timestampSec: number): Promise<number> {
    return getHistoricalCachedPrice("POL", timestampSec, async () => {
        let price = await fetchCoinGeckoHistoricalPrice("polygon-ecosystem-token", timestampSec).catch(() => null);
        if (!price)
            price = await fetchCoinGeckoHistoricalPrice("matic-network", timestampSec).catch(() => null);
        return price;
    });
}
/** Test-only: clears the in-memory cache so tests don't leak state across each other. */
export function __resetCryptoPriceCacheForTests() {
    priceCache.clear();
    inflightFetches.clear();
    historicalPriceCache.clear();
    inflightHistoricalFetches.clear();
}
//# sourceMappingURL=cryptoPrice.js.map