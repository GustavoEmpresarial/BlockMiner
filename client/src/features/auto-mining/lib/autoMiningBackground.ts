import { useEffect, useSyncExternalStore } from "react";

/**
 * Page lease so AutoMiningBackgroundRunner (when mounted) stands down while
 * AutoMiningPage drives the 1s claim poll. Same refcount pattern as youtubeBackground.
 */

let pageLeaseCount = 0;
const leaseListeners = new Set<() => void>();

function emitLease(): void {
  for (const l of leaseListeners) l();
}

function subscribeLease(listener: () => void): () => void {
  leaseListeners.add(listener);
  return () => {
    leaseListeners.delete(listener);
  };
}

function getLeaseSnapshot(): boolean {
  return pageLeaseCount > 0;
}

/** Called by AutoMiningPage: this tab drives the claim cycle. */
export function useAutoMiningPageLease(): void {
  useEffect(() => {
    pageLeaseCount += 1;
    emitLease();
    return () => {
      pageLeaseCount = Math.max(0, pageLeaseCount - 1);
      emitLease();
    };
  }, []);
}

export function useAutoMiningPageActive(): boolean {
  return useSyncExternalStore(subscribeLease, getLeaseSnapshot, () => true);
}

export function resetAutoMiningPageLease(): void {
  pageLeaseCount = 0;
  emitLease();
}
