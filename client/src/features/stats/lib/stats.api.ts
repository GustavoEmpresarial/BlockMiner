import { api } from '../../../shared/auth/auth.store';

export type PowerExpirationRow = {
  source: string;
  slug: string | null;
  name: string;
  hashRate: number;
  expiresAt: string | null;
  playedAt: string | null;
};

export type PowerStatsOverview = {
  totalHashrate: number;
  permanentHashrate: number;
  temporaryHashrate: number;
  permanentPercent: number;
  temporaryPercent: number;
  breakdown: {
    machines: number;
    gamesMinigame: number;
    gamesCheckin: number;
    youtube: number;
    autoMining: number;
  };
  miningPayoutMode: 'pol' | 'blk';
  nextExpirations: PowerExpirationRow[];
};

export type PowerStatsHistory = {
  miningLogByDay: Array<{
    date: string;
    avgSharePercent: number;
    avgWork: number;
    samples: number;
  }>;
  blkCycles: Array<{
    windowStart: string | null;
    totalHashrate: number;
    minerCount: number;
  }>;
};

export type UserPowerStatsPayload = {
  ok: true;
  generatedAt: string;
  overview: PowerStatsOverview;
  machines: {
    activeCount: number;
    inactiveCount: number;
    activeHashrate: number;
    inactiveHashrate: number;
    items: Array<{
      id: number;
      slotIndex: number;
      isActive: boolean;
      hashRate: number;
      minerName: string;
      minerSlug: string | null;
      imageUrl: string | null;
      roomNumber: number | null;
      rackPosition: number | null;
    }>;
  };
  youtube: {
    activeTotal: number;
    activeItems: Array<{
      id: number;
      hashRate: number;
      expiresAt: string | null;
      sourceVideoId: string | null;
    }>;
    history: Array<{
      id: number;
      hashRate: number;
      claimedAt: string | null;
      expiresAt: string | null;
      sourceVideoId: string | null;
      status: string;
      createdAt: string | null;
    }>;
  };
  games: {
    minigameTotal: number;
    checkinBonusTotal: number;
    checkinBonusSlug: string;
    byGame: Array<{
      slug: string;
      name: string;
      totalHashRate: number;
      items: Array<{ id: number; hashRate: number; expiresAt: string | null; playedAt: string | null }>;
    }>;
  };
  autoMining: {
    total: number;
    items: Array<{
      id: number;
      gpuHashRate: number;
      expiresAt: string | null;
      claimedAt: string | null;
    }>;
  };
  checkin: {
    streak: number;
    nextHashrateMilestones: Array<{
      dayThreshold: number;
      rewardValue: number;
      validityDays: number;
      displayTitle: string | null;
    }>;
  };
  otherSources: {
    referralHashrate: number;
    stakingHashrate: number;
    eventBonusHashrate: number;
    note: string;
  };
  network: {
    userRank: number | null;
    totalRankedUsers: number;
    activeUsersLast24h: number;
    lastBlkCycle: {
      id: number;
      windowStart: string | null;
      totalHashrate: number;
      minerCount: number;
      totalReward: number;
      distributed: boolean;
    } | null;
    blkPoolSharePercent: number | null;
    rewardPerCycle: number;
    blkPaused: boolean;
    activityWindowSec: number;
  };
  payout: {
    rows: Array<{
      key: string;
      labelKey: string;
      percent: number;
      noteKey: string;
    }>;
  };
  history: PowerStatsHistory;
  projections: {
    permanentHashrate: number;
    temporaryRemainingHashrate: number;
    hintKeys: string[];
  };
  analytics: {
    miningLogPeakShare: number;
    miningLogAvgShare: number;
    miningLogSamples: number;
  };
};

type PowerStatsErrorEnvelope = { ok: false; message?: string };

export type PowerStatsEnvelope = UserPowerStatsPayload | PowerStatsErrorEnvelope;

export async function fetchPowerStatsEnvelope(): Promise<PowerStatsEnvelope> {
  const { data } = await api.get<PowerStatsEnvelope>('/stats/power');
  return data;
}

export type MiningPayoutMode = 'pol' | 'blk';

export async function updateMiningPayoutMode(
  mode: MiningPayoutMode,
): Promise<{ ok: boolean; message?: string; mode?: MiningPayoutMode }> {
  const { data } = await api.patch<{ ok: boolean; message?: string; mode?: MiningPayoutMode }>(
    '/mining/payout-mode',
    { mode },
  );
  return data;
}
