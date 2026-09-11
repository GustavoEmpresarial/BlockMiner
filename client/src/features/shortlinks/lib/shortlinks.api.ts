import { isAxiosError } from 'axios';
import { api } from '../../../shared/auth/auth.store';

export type PasteadStatusPayload = {
  enabled: boolean;
  shortlinkName: string;
  rewardName: string;
  rewardHs: number;
  dailyHsEarned: number;
  dailyHsCap: number;
  dailyRuns: number;
  maxDailyRuns: number;
  available: boolean;
  pending: boolean;
  pendingToken: string | null;
  doneReached: boolean;
  claimReadyAt: string | null;
  maintenance?: boolean;
};

/** External shortlink status slice (ZerAds pastead + AdLinkFly share server shape). */
export type ExternalShortlinkStatusPayload = PasteadStatusPayload;

export type ShortlinkDailyReset = {
  timezone: string;
  localDate: string;
  nextResetAt: string;
  nextResetInMs: number;
};

export type InternalShortlinkStatusPayload = {
  dailyRuns?: number;
  maxDailyRuns?: number;
  currentStep?: number;
  inProgress?: boolean;
  shortlinkName?: string;
  rewardName?: string;
};

export type ShortlinkStatusResponse = {
  ok?: boolean;
  dailyReset?: ShortlinkDailyReset;
  status?: InternalShortlinkStatusPayload;
  pastead?: PasteadStatusPayload;
  adlinkfly?: ExternalShortlinkStatusPayload;
};

type StartPasteadResponse = {
  ok?: boolean;
  token?: string;
  externalUrl?: string;
};

type MarkPasteadDoneResponse = {
  ok?: boolean;
  token?: string;
  claimReadyAt?: string;
  message?: string;
  code?: string;
};

type ClaimPasteadResponse = {
  ok?: boolean;
  reward?: { message?: string; hashRate?: number };
  message?: string;
  code?: string;
};

export function readApiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    if (typeof data === 'object' && data !== null && 'message' in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg.trim();
    }
  }
  return fallback;
}

export function readResponseCode(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'code' in data) {
    return String((data as { code?: unknown }).code ?? '');
  }
  return '';
}

export async function startPasteadShortlink(): Promise<StartPasteadResponse> {
  return (await api.post<StartPasteadResponse>('/shortlink/pastead/start')).data;
}

export async function markPasteadDone(token: string): Promise<MarkPasteadDoneResponse> {
  return (await api.post<MarkPasteadDoneResponse>('/shortlink/pastead/done', { token })).data;
}

export async function claimPasteadShortlink(token: string | null | undefined): Promise<ClaimPasteadResponse> {
  const body = token ? { token } : {};
  return (await api.post<ClaimPasteadResponse>('/shortlink/pastead/claim', body)).data;
}

type StartAdlinkflyResponse = StartPasteadResponse;
type MarkAdlinkflyDoneResponse = MarkPasteadDoneResponse;
type ClaimAdlinkflyResponse = ClaimPasteadResponse;

export async function fetchShortlinkStatus(): Promise<ShortlinkStatusResponse> {
  return (await api.get<ShortlinkStatusResponse>('/shortlink/status')).data;
}

export async function startAdlinkflyShortlink(): Promise<StartAdlinkflyResponse> {
  return (await api.post<StartAdlinkflyResponse>('/shortlink/adlinkfly/start')).data;
}

export async function markAdlinkflyDone(token: string): Promise<MarkAdlinkflyDoneResponse> {
  return (await api.post<MarkAdlinkflyDoneResponse>('/shortlink/adlinkfly/done', { token })).data;
}

export async function claimAdlinkflyShortlink(token: string | null | undefined): Promise<ClaimAdlinkflyResponse> {
  const body = token ? { token } : {};
  return (await api.post<ClaimAdlinkflyResponse>('/shortlink/adlinkfly/claim', body)).data;
}
