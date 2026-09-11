import type { DashboardBlockRow } from './dashboard.types';

/** Miner slice from `state:update` / `getPublicState` (server-sanitized). */
export type MiningSocketMiner = {
  id?: string;
  username?: string;
  walletAddress?: string | null;
  rigs?: number;
  active?: boolean;
  lifetimeMined?: number;
  connected?: boolean;
  refCode?: string | null;
  boostMultiplier?: number;
  baseHashRate?: number;
  activeTemporaryHashRate?: number;
  estimatedHashRate?: number;
  miningAllocationPolBps?: number;
  referralCount?: number;
  balance?: number;
};

/** Public mining payload pushed over Socket.IO / mirrored by GET /mining/cycle. */
export type MiningSocketStats = {
  serverTime?: number;
  tokenPrice?: number;
  blockReward?: number;
  blockRewardShib?: number;
  blockIntervalMinutes?: number;
  blockNumber?: number;
  blockProgress?: number;
  totalMiners?: number;
  activeMiners?: number;
  totalMinted?: number;
  lastReward?: number;
  networkHashRate?: number;
  blockHistory?: DashboardBlockRow[];
  miner?: MiningSocketMiner | null;
  leaderboard?: unknown[];
  tokenSymbol?: string;
  blockCountdownSeconds?: number;
};
