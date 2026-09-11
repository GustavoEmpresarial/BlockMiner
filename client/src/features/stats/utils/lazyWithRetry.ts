import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Simplified port of legacy/client/src/shared/utils/lazyWithRetry.ts. current/ has no
 * chunk-load-error/build-id detection helper yet, so this keeps the one behavior that
 * matters for a heavy tabbed dashboard — a single quiet retry on a transient chunk-load
 * failure — without depending on machinery that doesn't exist here. */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Failed to fetch dynamically imported module|Loading chunk|dynamically imported module/i.test(msg);
}

function importWithRetry<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch(async (err: unknown) => {
    if (!isChunkLoadError(err)) throw err;
    await sleep(600);
    return factory();
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithRetry(factory));
}
