/**
 * Global rate limiter for all Etherscan V2 API calls in this process.
 * Ported from legacy/server/shared/etherscanRateLimiter.ts — no current/ code calls the
 * real Etherscan/Polygonscan HTTP API yet (transparency.activity.service.ts only does RPC,
 * tx-history aggregation is a documented later-phase deferral), so this isn't wired to a
 * call site yet either — ported preventively so whoever adds that call site later doesn't
 * have to rediscover the free-tier limit the hard way.
 *
 * The free tier allows 3 req/sec on a single key. Await this before every Etherscan/
 * Polygonscan API fetch to serialize calls process-wide so a shared key never exceeds it.
 */

const MIN_INTERVAL_MS = 600;
let _lastCallAt = 0;
let _pendingRelease: Promise<void> = Promise.resolve();

export async function etherscanRateLimitWait(): Promise<void> {
  const prev = _pendingRelease;
  let resolve!: () => void;
  _pendingRelease = new Promise<void>((r) => {
    resolve = r;
  });

  await prev;

  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - _lastCallAt);
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  _lastCallAt = Date.now();
  resolve();
}
