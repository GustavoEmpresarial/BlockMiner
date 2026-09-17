// Types for the Tournaments page.

export interface TournamentPrize {
  id: number;
  rankFrom: number;
  rankTo: number;
  prizeType: 'POL' | 'BLK' | 'MINING_BOOST' | 'MACHINE';
  polAmount?: string;
  blkAmount?: string;
  boostHashRate?: number;
  boostHours?: number;
  minerName?: string;
  minerCount?: number;
  minerId?: number | null;
  miner?: {
    id: number;
    name: string;
    imageUrl?: string | null;
    baseHashRate?: number | string;
  } | null;
}

export interface TournamentSummary {
  id: number;
  name: string;
  description?: string;
  type: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
  metric: string;
  startsAt: string;
  endsAt: string;
  windowUtc?: { start: string; end: string };
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
  prizes: TournamentPrize[];
  _count: { entries: number };
}

export interface LeaderboardEntry {
  id: number;
  score: number;
  /** POL deposited in window — informational when metric is DEPOSITS_USD */
  scorePol?: number | null;
  rank?: number;
  user: { id: number; username: string; avatarUrl?: string };
}

export interface TournamentDetail {
  tournament: TournamentSummary;
  top: LeaderboardEntry[];
  myEntry?: { score: number; rank?: number; rewardGranted: boolean } | null;
  myPrize?: { prizeType: string } | null;
  myRankLive?: number | null;
  scoresComputedAt?: string | null;
  myDepositBreakdown?: {
    breakdown: { total: number; txCount: number; totalUsd?: number | null; totalPol?: number };
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

