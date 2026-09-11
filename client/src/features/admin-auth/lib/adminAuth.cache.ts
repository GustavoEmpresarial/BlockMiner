/**
 * Client-side admin auth check cache.
 * Shared by AdminLayout + login/logout so a successful login never races a stale `false`.
 */

const AUTH_CHECK_THROTTLE_MS = 30_000;

let adminAuthCachedAt = 0;
let adminAuthCachedValue: boolean | null = null;
let adminAuthInflight: Promise<boolean> | null = null;

export function getAdminAuthCache(): { value: boolean | null; fresh: boolean } {
  const fresh =
    adminAuthCachedValue !== null && Date.now() - adminAuthCachedAt < AUTH_CHECK_THROTTLE_MS;
  return { value: fresh ? adminAuthCachedValue : null, fresh };
}

export function setAdminAuthCache(ok: boolean): void {
  adminAuthCachedAt = Date.now();
  adminAuthCachedValue = ok;
}

export function clearAdminAuthCache(): void {
  adminAuthCachedAt = 0;
  adminAuthCachedValue = null;
  adminAuthInflight = null;
}

export async function checkAdminAuthThrottled(fetcher: () => Promise<boolean>): Promise<boolean> {
  const now = Date.now();
  if (adminAuthCachedValue !== null && now - adminAuthCachedAt < AUTH_CHECK_THROTTLE_MS) {
    return adminAuthCachedValue;
  }
  if (adminAuthInflight) return adminAuthInflight;
  adminAuthInflight = fetcher()
    .then((ok) => {
      setAdminAuthCache(ok);
      return ok;
    })
    .finally(() => {
      adminAuthInflight = null;
    });
  return adminAuthInflight;
}

/** Test-only helpers */
export function __adminAuthCacheTestState() {
  return { at: adminAuthCachedAt, value: adminAuthCachedValue, inflight: Boolean(adminAuthInflight) };
}
