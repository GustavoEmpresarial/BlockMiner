import { api } from '../../../shared/auth/auth.store';
import type {
  CreatorUser,
  Profile,
  RewardMiner,
  RewardSettingsResponse,
  Submission,
} from './creators.types';

// ─── Creators Flag Management ──────────────────────────────────────────────────

export async function listCreators(): Promise<CreatorUser[]> {
  const res = await api.get<{ ok: boolean; creators?: CreatorUser[] }>('/admin/creators');
  return res.data.ok && Array.isArray(res.data.creators) ? res.data.creators : [];
}

export async function searchCreators(query: string): Promise<CreatorUser[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const res = await api.get<{ ok: boolean; users?: CreatorUser[] }>(
    `/admin/creators/search?q=${encodeURIComponent(trimmed)}`,
  );
  return res.data.ok && Array.isArray(res.data.users) ? res.data.users : [];
}

export async function upsertCreator(id: number, youtubeUrl: string | null): Promise<boolean> {
  const res = await api.put<{ ok: boolean }>(`/admin/creators/${id}`, {
    youtubeUrl: youtubeUrl?.trim() || null,
  });
  return res.data.ok;
}

export async function removeCreator(id: number): Promise<boolean> {
  const res = await api.delete<{ ok: boolean }>(`/admin/creators/${id}`);
  return res.data.ok;
}

// ─── Credential Requests ───────────────────────────────────────────────────────

export async function listCredentialRequests(): Promise<Profile[]> {
  const res = await api.get<{ ok: boolean; profiles?: Profile[] }>('/admin/social/credential-requests');
  return res.data.ok && Array.isArray(res.data.profiles) ? res.data.profiles : [];
}

export async function approveCredentialRequest(id: number): Promise<Profile> {
  const res = await api.post<{ ok: boolean; profile: Profile }>(
    `/admin/social/credential-requests/${id}/approve`,
  );
  return res.data.profile;
}

export async function rejectCredentialRequest(id: number, rejectNote?: string): Promise<Profile> {
  const res = await api.post<{ ok: boolean; profile: Profile }>(
    `/admin/social/credential-requests/${id}/reject`,
    { rejectNote: rejectNote?.trim() || undefined },
  );
  return res.data.profile;
}

// ─── Profiles Management ───────────────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  const res = await api.get<{ ok: boolean; profiles?: Profile[] }>('/admin/social/profiles');
  return res.data.ok && Array.isArray(res.data.profiles) ? res.data.profiles : [];
}

export async function createProfile(data: {
  userId: number;
  channelName: string;
  channelUrl?: string;
  bio?: string;
  isCredentialed?: boolean;
}): Promise<Profile> {
  const res = await api.post<{ ok: boolean; profile: Profile }>('/admin/social/profiles', data);
  return res.data.profile;
}

export async function updateProfile(
  id: number,
  data: Partial<{
    channelName: string;
    channelUrl: string | null;
    channelPhoto: string | null;
    bio: string | null;
    isCredentialed: boolean;
  }>,
): Promise<Profile> {
  const res = await api.put<{ ok: boolean; profile: Profile }>(`/admin/social/profiles/${id}`, data);
  return res.data.profile;
}

export async function deleteProfile(id: number): Promise<boolean> {
  const res = await api.delete<{ ok: boolean }>(`/admin/social/profiles/${id}`);
  return res.data.ok;
}

// ─── Submissions Moderation ───────────────────────────────────────────────────

export async function listSubmissions(status = 'pending'): Promise<Submission[]> {
  const res = await api.get<{ ok: boolean; submissions?: Submission[] }>(
    `/admin/social/submissions?status=${encodeURIComponent(status)}`,
  );
  return res.data.ok && Array.isArray(res.data.submissions) ? res.data.submissions : [];
}

export async function approveSubmission(
  id: number,
): Promise<{ rewardGranted: boolean; rewardMinerName: string | null }> {
  const res = await api.post<{ ok: boolean; rewardGranted: boolean; rewardMinerName: string | null }>(
    `/admin/social/submissions/${id}/approve`,
  );
  return {
    rewardGranted: Boolean(res.data.rewardGranted),
    rewardMinerName: res.data.rewardMinerName ?? null,
  };
}

export async function rejectSubmission(id: number, reviewNote?: string): Promise<boolean> {
  const res = await api.post<{ ok: boolean }>(`/admin/social/submissions/${id}/reject`, {
    reviewNote: reviewNote?.trim() || undefined,
  });
  return res.data.ok;
}

export async function deleteSubmission(id: number): Promise<boolean> {
  const res = await api.delete<{ ok: boolean }>(`/admin/social/submissions/${id}`);
  return res.data.ok;
}

// ─── Reward Settings & Miners ─────────────────────────────────────────────────

export async function getRewardSettings(): Promise<RewardSettingsResponse> {
  const res = await api.get<RewardSettingsResponse>('/admin/social/reward-settings');
  return res.data;
}

export async function setRewardSettings(minerId: number | null): Promise<RewardSettingsResponse> {
  const res = await api.put<RewardSettingsResponse>('/admin/social/reward-settings', { minerId });
  return res.data;
}

export async function searchMiners(query: string): Promise<RewardMiner[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const res = await api.get<{ ok: boolean; miners?: RewardMiner[] }>(
    `/admin/miners?q=${encodeURIComponent(trimmed)}`,
  );
  return res.data.ok && Array.isArray(res.data.miners) ? res.data.miners.slice(0, 20) : [];
}
