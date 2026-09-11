import type { MiningSocketMiner, MiningSocketStats } from './miningSocket.types';

export type DashboardBlockRow = {
  blockNumber?: number | string;
  userReward?: unknown;
  userRewardShib?: unknown;
  totalReward?: unknown;
  totalRewardShib?: unknown;
  timestamp?: string | Date | unknown;
  persistFailed?: boolean;
};

export type DashboardMinerStats = MiningSocketMiner;

export type DashboardCycleState = MiningSocketStats & {
  ok?: boolean;
  blockCountdownSeconds?: number;
  tokenSymbol?: string;
};
