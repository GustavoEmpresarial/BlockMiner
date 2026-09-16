/**
 * Property reads that can never throw.
 *
 * Injected wallet providers (`window.ethereum` & friends) are frequently wrapped in a
 * Proxy by extensions / in-app browsers. A trap that returns a re-bound function for a
 * property the target defines as non-writable + non-configurable violates the ES
 * invariant, and the plain read throws:
 *
 *   TypeError: 'get' on proxy: property 'on' is a read-only and non-configurable data
 *   property on the proxy target but the proxy did not return its actual value
 *
 * Observed in production on /wallet (root error boundary crash, Android Chrome). Any
 * read of a third-party-controlled object must go through these helpers.
 */

/** Reads `obj[key]`, returning `undefined` instead of throwing. */
export function safeGet(obj: unknown, key: string): unknown {
  if (obj == null) return undefined;
  if (typeof obj !== 'object' && typeof obj !== 'function') return undefined;
  try {
    return (obj as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/** Reads `obj[key]` only when it is callable; `undefined` otherwise (never throws). */
export function safeGetFunction<T extends (...args: never[]) => unknown>(
  obj: unknown,
  key: string,
): T | undefined {
  const value = safeGet(obj, key);
  return typeof value === 'function' ? (value as T) : undefined;
}

/** True when `obj[key]` is strictly `true` (never throws). */
export function safeFlag(obj: unknown, key: string): boolean {
  return safeGet(obj, key) === true;
}

/** Invokes `obj[key](...args)`, swallowing both the read and the call failure. */
export function safeInvoke(obj: unknown, key: string, ...args: unknown[]): boolean {
  const fn = safeGetFunction(obj, key);
  if (!fn) return false;
  try {
    (fn as (...a: unknown[]) => unknown).apply(obj, args);
    return true;
  } catch {
    return false;
  }
}
