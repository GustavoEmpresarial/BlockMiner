const CHUNK_RELOAD_KEY = 'blockminer:chunk-reload-at';
// Persistent loop guard: unlike CHUNK_RELOAD_KEY (sessionStorage, wiped on every
// successful boot), this survives reloads and is ONLY cleared once the app has
// proven stable for a while (markAppStable). Without it, a user stuck on a stale
// cached index.html reloads → boots → clears the counter → chunk 404s again →
// reloads forever. This is the real "all pages refresh by themselves" loop.
const LOOP_GUARD_KEY = 'blockminer:chunk-reload-loopguard';
const BUILD_ID_KEY = 'blockminer:bm-build';
const BUILD_RELOADED_KEY = 'blockminer:bm-build-reloaded';
const LEGACY_CHUNK_KEY = 'bm_chunk_reload_v1';
const LEGACY_ASSET_KEY = 'bm_asset_reload_v1';
const CHUNK_RELOAD_MAX = 3;
const CHUNK_RELOAD_WINDOW_MS = 120_000;

/** Read a timestamp array from a Storage key, tolerating legacy single-number values. */
function readStamps(storage: Storage, key: string): number[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((n) => typeof n === 'number' && Number.isFinite(n));
    }
    const single = Number(raw);
    return Number.isFinite(single) ? [single] : [];
  } catch {
    const single = Number(storage.getItem(key));
    return Number.isFinite(single) ? [single] : [];
  }
}

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error ?? '');

  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Expected a JavaScript-or-Wasm module script') ||
    message.includes('MIME type') ||
    message.includes('text/html') ||
    message.includes('ChunkLoadError') ||
    message.includes('Loading chunk') ||
    message.includes('dynamically imported module')
  );
}

export function shouldAutoReloadChunkError(now = Date.now()): boolean {
  try {
    // Persistent guard first: it survives the per-boot marker wipe, so a tight
    // reload→boot→reload loop (stale cached shell) actually trips the cap here
    // and we stop reloading instead of thrashing forever.
    const guardRecent = readStamps(window.localStorage, LOOP_GUARD_KEY).filter(
      (t) => now - t < CHUNK_RELOAD_WINDOW_MS,
    );
    if (guardRecent.length >= CHUNK_RELOAD_MAX) {
      return false;
    }

    const recent = readStamps(window.sessionStorage, CHUNK_RELOAD_KEY).filter(
      (t) => now - t < CHUNK_RELOAD_WINDOW_MS,
    );
    if (recent.length >= CHUNK_RELOAD_MAX) {
      return false;
    }
    recent.push(now);
    guardRecent.push(now);
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, JSON.stringify(recent));
    try {
      window.localStorage.setItem(LOOP_GUARD_KEY, JSON.stringify(guardRecent));
    } catch {
      /* localStorage may be unavailable — session guard still applies */
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Call once the app has rendered and stayed alive long enough to be considered
 * healthy. Only then do we forget the reload history — a crash-loop that reloads
 * before this fires keeps its counter and the circuit breaker trips.
 */
export function markAppStable(): void {
  try {
    window.localStorage.removeItem(LOOP_GUARD_KEY);
  } catch {
    /* ignore */
  }
  clearChunkReloadMarkers();
}

export function forceReloadForNewBuild(): void {
  try {
    window.sessionStorage.setItem('blockminer:last-forced-reload', String(Date.now()));
  } catch {
    // ignore storage failure
  }

  const navigate = (): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('_bm_build', String(Date.now()));
    window.location.replace(url.toString());
  };

  // Bust CDN/browser cache for index.html before navigating (stale shell → stale chunk refs).
  void fetch(`${window.location.pathname}${window.location.search}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  })
    .catch(() => {})
    .finally(navigate);
}

export function clearChunkReloadMarkers(): void {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    window.sessionStorage.removeItem(LEGACY_CHUNK_KEY);
    window.sessionStorage.removeItem(LEGACY_ASSET_KEY);
  } catch {
    // ignore storage failure
  }
}

/**
 * After deploy, index.html carries a new bm-build id (entry bundle hash).
 * If the user still runs an old JS bundle, reload once before React mounts.
 * @returns false when a reload was triggered (caller should abort boot).
 */
export function ensureCurrentBuild(): boolean {
  if (typeof document === 'undefined') return true;
  const meta = document.querySelector('meta[name="bm-build"]')?.getAttribute('content');
  if (!meta) return true;
  try {
    const prev = window.localStorage.getItem(BUILD_ID_KEY);
    if (prev && prev !== meta) {
      const alreadyReloaded = window.sessionStorage.getItem(BUILD_RELOADED_KEY);
      if (alreadyReloaded === meta) {
        window.localStorage.setItem(BUILD_ID_KEY, meta);
        return true;
      }
      window.localStorage.setItem(BUILD_ID_KEY, meta);
      window.sessionStorage.setItem(BUILD_RELOADED_KEY, meta);
      clearChunkReloadMarkers();
      forceReloadForNewBuild();
      return false;
    }
    window.localStorage.setItem(BUILD_ID_KEY, meta);
    window.sessionStorage.removeItem(BUILD_RELOADED_KEY);
  } catch {
    return true;
  }
  return true;
}

/** Build id the currently-running shell was served with (from index.html <meta>). */
function getLoadedBuildId(): string | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('meta[name="bm-build"]')?.getAttribute('content') ?? null;
}

/**
 * Fetch the build id the server is serving RIGHT NOW. Returns null when we can't
 * prove anything — index.html itself 502s/520s, times out, or isn't HTML. A null
 * result MUST be treated as "no confirmed new build" so we never reload on a
 * transient backend-saturation error page.
 */
async function fetchServerBuildId(): Promise<string | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/index.html', {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!res.ok) return null; // 502/520/500 during saturation → unknown, not a deploy
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return null;
    const html = await res.text();
    const match = html.match(
      /<meta[^>]+name=["']bm-build["'][^>]+content=["']([^"']+)["']/i,
    );
    return match?.[1] ?? null;
  } catch {
    return null; // network error / timeout → treat as transient, never reload
  }
}

/**
 * The ONLY correct trigger for an automatic reload: the server has published a
 * DIFFERENT build than the one we're running. A dynamic import can fail for two
 * very different reasons — a genuinely stale post-deploy chunk (reload fixes it)
 * or a transient 502/520/timeout while the backend is saturated (reload makes it
 * worse and shows up to users as "the page refreshes by itself"). We only reload
 * when we can CONFIRM the build id changed; otherwise the caller falls back to a
 * retry / the ErrorBoundary, with no auto-refresh.
 */
export async function reloadIfBuildChanged(): Promise<boolean> {
  const loaded = getLoadedBuildId();
  const server = await fetchServerBuildId();
  if (!loaded || !server || loaded === server) return false;
  if (!shouldAutoReloadChunkError()) return false;
  forceReloadForNewBuild();
  return true;
}

