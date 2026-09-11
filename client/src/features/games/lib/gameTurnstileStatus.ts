/**
 * Fetches whether the next rewarded mini-game needs Cloudflare Turnstile.
 */
import { api } from '../../../shared/auth/auth.store';

export type GameTurnstileStatus = {
  ok?: boolean;
  active: boolean;
  everyN: number;
  rewardedCount: number;
  required: boolean;
  remainingUntilRequired: number;
  hasPass?: boolean;
};

export async function fetchGameTurnstileStatus(): Promise<GameTurnstileStatus> {
  try {
    const { data } = await api.get<GameTurnstileStatus>('/games/turnstile-status');
    return {
      active: Boolean(data?.active),
      everyN: Number(data?.everyN) || 0,
      rewardedCount: Number(data?.rewardedCount) || 0,
      required: Boolean(data?.required),
      remainingUntilRequired: Number(data?.remainingUntilRequired) || 0,
      hasPass: Boolean(data?.hasPass),
    };
  } catch {
    return {
      active: false,
      everyN: 0,
      rewardedCount: 0,
      required: false,
      remainingUntilRequired: 0,
      hasPass: false,
    };
  }
}

/** Verify token server-side and store a one-shot pass for the next gated reward. */
export async function submitGameTurnstilePass(cfTurnstileToken: string): Promise<boolean> {
  try {
    const { data } = await api.post<{ ok?: boolean }>('/games/turnstile-pass', {
      cfTurnstileToken,
    });
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}
