/**
 * Derives the player-facing state of a Mini Pass season.
 */
import type { MiniPassSeasonState } from "./mini-pass.types.js";

type SeasonLike = {
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
  deletedAt?: Date | null;
};

export function getMiniPassSeasonState(season: SeasonLike | null | undefined, now: Date = new Date()): MiniPassSeasonState {
  if (!season || season.deletedAt) return "hidden";
  if (!season.isActive) return "hidden";

  const startsAt = season.startsAt?.getTime?.();
  const endsAt = season.endsAt?.getTime?.();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || (endsAt as number) < (startsAt as number)) {
    return "hidden";
  }

  const t = now.getTime();
  if (t < (startsAt as number)) return "upcoming";
  if (t <= (endsAt as number)) return "live";
  return "ended";
}

export function isMiniPassSeasonVisible(season: SeasonLike | null | undefined, now: Date = new Date()): boolean {
  const state = getMiniPassSeasonState(season, now);
  return state === "upcoming" || state === "live";
}

export function isMiniPassSeasonLive(season: SeasonLike | null | undefined, now: Date = new Date()): boolean {
  return getMiniPassSeasonState(season, now) === "live";
}
