/** Ambient types for game2048.service (implementation lives in dist until full src restore). */

export type Game2048ClaimMeta = { ip?: string | null; userAgent?: string | null };

export function computeCooldownEndsAt(claimedAt: Date | null | undefined, now: Date): Date | null;

export function getGame2048Status(userId: number, now?: Date): Promise<unknown>;

export function startGame2048Session(
  userId: number,
  now?: Date,
): Promise<
  | { ok: true; reused: boolean; session: unknown }
  | { ok: false; code: string; status: number; cooldownEndsAt?: string; cooldownSecondsRemaining?: number }
>;

export function restartGame2048Session(
  userId: number,
  now?: Date,
): Promise<
  | { ok: true; session: unknown }
  | { ok: false; code: string; status: number; cooldownEndsAt?: string; cooldownSecondsRemaining?: number }
>;

export function applyGame2048Move(
  userId: number,
  sessionId: number,
  direction: "up" | "down" | "left" | "right",
  now?: Date,
): Promise<
  | { ok: true; moved: boolean; session: unknown }
  | { ok: false; code: string; status: number; session?: unknown }
>;

export function claimGame2048Reward(
  userId: number,
  sessionId: number,
  meta?: Game2048ClaimMeta,
  now?: Date,
): Promise<
  | {
      ok: true;
      idempotent?: boolean;
      rewardHashRate: number;
      powerDays: number;
      rewardPowerDays: number;
      rewardPowerHours: number;
      nextClaimAllowedAt: string | null;
      cooldownSecondsRemaining: number;
    }
  | {
      ok: false;
      code: string;
      status: number;
      cooldownEndsAt?: string;
      cooldownSecondsRemaining?: number;
    }
>;
