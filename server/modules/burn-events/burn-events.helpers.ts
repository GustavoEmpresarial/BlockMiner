import type { BurnEventOpenCheck } from "./burn-events.types.js";

/** Whether a burn event is claimable right now (active window + stock). */
export function isEventCurrentlyOpen(event: BurnEventOpenCheck, now: Date = new Date()): boolean {
  if (!event.isActive || event.deletedAt) return false;
  if (event.startsAt && now < event.startsAt) return false;
  if (event.endsAt && now > event.endsAt) return false;
  if (event.stockTotal != null && event.stockClaimed >= event.stockTotal) return false;
  return true;
}

/**
 * Visible on the player hub: scheduled upcoming, currently open, OR still in
 * window but not claimable (out of stock / user already hit personal limit).
 * Hides only inactive / deleted / past endsAt — never "vanish" mid-event.
 */
export function isEventVisibleOnHub(event: BurnEventOpenCheck, now: Date = new Date()): boolean {
  if (!event.isActive || event.deletedAt) return false;
  if (event.endsAt && now > event.endsAt) return false;
  return true;
}

export function parseOptionalDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Deduped positive owned-machine ids. Caller enforces the input-size cap. */
export function normalizeMinerIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  );
}
