import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isChunkLoadError, reloadIfBuildChanged } from './chunkLoadError';

/** Never resolves — page is navigating away after a confirmed new-build reload. */
const RELOADING = new Promise<never>(() => {});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Wrap a dynamic `import()` so it survives the two failure modes cleanly:
 *  - transient blip (502/520/timeout during backend saturation) → retry once,
 *    then let the error bubble to the ErrorBoundary. NEVER auto-reload — that was
 *    the "page refreshes by itself" bug.
 *  - genuinely stale post-deploy chunk → reload, but ONLY after confirming the
 *    server actually shipped a new build id.
 */
export function importWithChunkRetry<T>(factory: () => Promise<T>): Promise<T> {
  return factory().catch(async (err: unknown) => {
    if (!isChunkLoadError(err)) throw err;
    // One quiet retry absorbs a momentary blip without any user-visible reload.
    await sleep(600);
    try {
      return await factory();
    } catch (retryErr: unknown) {
      // Only navigate if the server truly published a different build.
      if (await reloadIfBuildChanged()) return RELOADING;
      throw retryErr; // same build → transient → ErrorBoundary shows a retry button
    }
  });
}

/**
 * `React.lazy` with automatic reload when a hashed chunk 404s after deploy.
 *
 * The constraint is `ComponentType<any>` (not `<unknown>`) so components that require props
 * (e.g. the Stats dashboard tabs) keep their real prop types through the wrapper — a
 * `ComponentType<Props>` is not assignable to `ComponentType<unknown>` because props are
 * contravariant. Prop-less route components remain assignable either way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithChunkRetry(factory));
}
