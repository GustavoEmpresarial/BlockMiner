import type { LucideIcon } from 'lucide-react';
import { CheckCircle, ClipboardList, Combine, Cpu, Flame, Gamepad2, Gift, Trophy, UserPlus, Wallet, Youtube, Zap } from 'lucide-react';

/**
 * Player hub category for a tournament metric.
 * Keep in sync with the player SPA metric→hub map (dist patch / source page).
 */
export type TournamentHubCategoryId =
  | 'offerwall'
  | 'deposit'
  | 'mining'
  | 'activity'
  | 'youtube'
  | 'referral'
  | 'forge'
  | 'burn'
  | 'tasks'
  | 'engagement'
  | 'games'
  | 'other';

const METRIC_TO_HUB: Record<string, TournamentHubCategoryId> = {
  OFFERS_ALL: 'offerwall',
  OFFERS_INTERNAL: 'offerwall',
  OFFERS_EXTERNAL: 'offerwall',
  DEPOSITS_POL: 'deposit',
  DEPOSITS_USD: 'deposit',
  HASHRATE: 'mining',
  BLOCKS_MINED: 'mining',
  CHECKINS: 'activity',
  TASKS_COMPLETED: 'tasks',
  FAUCET: 'engagement',
  SHORTLINK: 'engagement',
  AUTO_MINING: 'engagement',
  MINIGAME_WINS: 'games',
  ALL_ACTIVITIES: 'activity',
  YOUTUBE: 'youtube',
  REFERRALS: 'referral',
  MERGES: 'forge',
  BURNS: 'burn',
};

/** Display order of hub cards (unknown metrics fall into `other`). */
export const TOURNAMENT_HUB_ORDER: TournamentHubCategoryId[] = [
  'offerwall',
  'deposit',
  'mining',
  'activity',
  'youtube',
  'referral',
  'forge',
  'burn',
  'tasks',
  'engagement',
  'games',
  'other',
];

export function tournamentHubCategory(metric: string): TournamentHubCategoryId {
  return METRIC_TO_HUB[metric] ?? 'other';
}

export const HUB_CATEGORY_META: Record<TournamentHubCategoryId, { icon: LucideIcon }> = {
  offerwall: { icon: Gift },
  deposit: { icon: Wallet },
  mining: { icon: Cpu },
  activity: { icon: CheckCircle },
  youtube: { icon: Youtube },
  referral: { icon: UserPlus },
  forge: { icon: Combine },
  burn: { icon: Flame },
  tasks: { icon: ClipboardList },
  engagement: { icon: Zap },
  games: { icon: Gamepad2 },
  other: { icon: Trophy },
};
