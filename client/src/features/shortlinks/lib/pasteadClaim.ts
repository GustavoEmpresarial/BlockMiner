import { isAxiosError } from 'axios';
import { t } from './shortlinks.i18n';
import {
  claimPasteadShortlink,
  readApiErrorMessage,
  readResponseCode,
} from './shortlinks.api';

/** Matches production bundle retry loop (`_qe=30`, `CF=2500`). */
export const PASTEAD_CLAIM_MAX_ATTEMPTS = 30;
export const PASTEAD_CLAIM_RETRY_WAIT_MS = 2500;
const PASTEAD_NOT_COMPLETED_EXTRA_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export type PasteadClaimOutcome =
  | { ok: true; message: string; hashRate?: number }
  | { ok: false; code?: string; message: string };

async function claimOnce(token: string): Promise<PasteadClaimOutcome> {
  try {
    const res = await claimPasteadShortlink(token);
    if (res.ok) {
      return {
        ok: true,
        message: res.reward?.message || t('shortlinks.pastead_claim_success'),
        hashRate: res.reward?.hashRate,
      };
    }
    const msg =
      typeof res.message === 'string' && res.message.trim()
        ? res.message.trim()
        : t('shortlinks.pastead_claim_failed');
    return {
      ok: false,
      code: readResponseCode(res) || res.code,
      message: msg,
    };
  } catch (err) {
    const data = isAxiosError(err) ? err.response?.data : undefined;
    return {
      ok: false,
      code: readResponseCode(data),
      message: readApiErrorMessage(err, t('shortlinks.pastead_claim_failed')),
    };
  }
}

export async function claimPasteadWithRetry(
  token: string | null | undefined,
  opts?: { onWaiting?: () => void },
): Promise<PasteadClaimOutcome> {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (trimmed.length < 16) {
    return {
      ok: false,
      code: 'SHORTLINK_NO_SESSION',
      message: t('shortlinks.pastead_claim_failed'),
    };
  }

  for (let attempt = 0; attempt < PASTEAD_CLAIM_MAX_ATTEMPTS; attempt += 1) {
    const outcome = await claimOnce(trimmed);
    if (outcome.ok) return outcome;

    if (outcome.code === 'SHORTLINK_TOO_FAST') {
      opts?.onWaiting?.();
      await sleep(PASTEAD_CLAIM_RETRY_WAIT_MS);
      continue;
    }
    if (outcome.code === 'SHORTLINK_NOT_COMPLETED' && attempt < PASTEAD_NOT_COMPLETED_EXTRA_RETRIES) {
      opts?.onWaiting?.();
      await sleep(PASTEAD_CLAIM_RETRY_WAIT_MS);
      continue;
    }
    return outcome;
  }

  return { ok: false, message: t('shortlinks.pastead_claim_retry') };
}
