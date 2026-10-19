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
  /** Dev-only preview: ranked live, never finalized or paid. */
  preview?: boolean;
  prizes: TournamentPrize[];
  _count: { entries: number };
}

export interface LeaderboardEntry {
  id: number;
  score: number;
  /** POL deposited in window — informational when metric is DEPOSITS_USD */
  scorePol?: number | null;
  rank?: number;
  user: { id: number; username: string; avatarUrl?: string | null };
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
  offerwallRules?: OfferwallRules | null;
  myOfferwallBreakdown?: OfferwallBreakdown | null;
}

export type OfferwallSourceKey =
  | 'internal'
  | 'offerwallMe'
  | 'moneyRain'
  | 'multiwall'
  | 'offerwallGg'
  | 'zerads';

export interface OfferwallRules {
  zeradsMaxPerUtcDay: number;
  tieBreak: 'first_to_reach';
  sources: Array<{
    key: OfferwallSourceKey;
    rule: 'per_completion' | 'per_credit' | 'per_view' | 'per_click_daily_cap';
    scoringFrom: string | null;
  }>;
}

export interface OfferwallBreakdown {
  internal: number;
  offerwallMe: number;
  moneyRain: number;
  multiwall: number;
  offerwallGg: number;
  zeradsRaw: number;
  zeradsCredited: number;
  total: number;
  reachedAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

