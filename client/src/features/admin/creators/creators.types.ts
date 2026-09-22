/**
 * Types for Admin Creators & Social YouTube management.
 */

export type AdminSocialTab = 'requests' | 'submissions' | 'profiles' | 'flags' | 'settings';

export interface CreatorUser {
  id: number;
  username?: string | null;
  name?: string | null;
  youtubeUrl?: string | null;
  isCreator?: boolean;
  createdAt?: string | Date;
  youtuberProfile?: {
    channelName: string;
    channelPhoto: string | null;
    channelUrl: string | null;
  } | null;
}

export interface ProfileUser {
  id?: number;
  username: string;
  name?: string | null;
  email?: string | null;
}

export interface Profile {
  id: number;
  channelName: string;
  channelPhoto: string | null;
  channelUrl: string | null;
  bio?: string | null;
  isCredentialed: boolean;
  credentialRequestStatus?: string | null;
  credentialRejectNote?: string | null;
  createdAt: string | Date;
  user: ProfileUser;
  _count?: { submissions: number };
}

export interface Submission {
  id: number;
  videoUrl: string;
  videoId: string;
  title: string | null;
  status: string;
  reviewNote?: string | null;
  rewardGranted?: boolean;
  submittedAt: string | Date;
  profile: {
    channelName: string;
    channelPhoto: string | null;
    channelUrl?: string | null;
  };
  user: {
    id?: number;
    username: string;
    name?: string | null;
  };
  miner?: {
    id?: number;
    name: string;
    imageUrl?: string | null;
  } | null;
}

export interface RewardMiner {
  id: number;
  name: string;
  imageUrl?: string | null;
  baseHashRate?: number | null;
}

export interface RewardSettingsResponse {
  ok: boolean;
  minerId: number | null;
  miner: RewardMiner | null;
}
