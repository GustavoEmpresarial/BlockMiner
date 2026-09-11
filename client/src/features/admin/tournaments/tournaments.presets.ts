import {
  emptyPrizeDraft,
  type PrizeDraft,
  type TournamentFormState,
  type TournamentMetric,
  type TournamentType,
} from './tournaments.admin.types';

export type TournamentPreset = {
  id: string;
  labelKey: string;
  hintKey: string;
  name: string;
  description: string;
  type: TournamentType;
  metric: TournamentMetric;
  recurring: boolean;
  prizes: PrizeDraft[];
};

/** Catalog miner IDs used by portfolio ladders (production shop). */
const MINER = {
  quantumForge: 209,
  titanCore: 210,
  hashTitan: 10,
  neonHash: 211,
  cryptoDrill: 30,
  ironPulse: 212,
  blackNova: 213,
  hyperDrill: 214,
} as const;

function pol(rankFrom: number, rankTo: number, amount: string): PrizeDraft {
  return { ...emptyPrizeDraft(rankFrom, rankTo), prizeType: 'POL', polAmount: amount };
}

function blk(rankFrom: number, rankTo: number, amount: string): PrizeDraft {
  return { ...emptyPrizeDraft(rankFrom, rankTo), prizeType: 'BLK', blkAmount: amount };
}

function machine(rankFrom: number, rankTo: number, minerId: number, minerCount = 1): PrizeDraft {
  return {
    ...emptyPrizeDraft(rankFrom, rankTo),
    prizeType: 'MACHINE',
    minerId,
    minerCount: String(minerCount),
  };
}

function boost(rankFrom: number, rankTo: number, hashRate: string, hours: string): PrizeDraft {
  return {
    ...emptyPrizeDraft(rankFrom, rankTo),
    prizeType: 'MINING_BOOST',
    boostHashRate: hashRate,
    boostHours: hours,
  };
}

/** Base recurring series used in production. Prizes match portfolio plan ladders. */
export const TOURNAMENT_PRESETS: TournamentPreset[] = [
  {
    id: 'daily-offerwall',
    labelKey: 'adminTournaments.preset_daily_offerwall',
    hintKey: 'adminTournaments.preset_daily_offerwall_hint',
    name: 'Daily Offerwall Tournament',
    description: 'Daily ranking by completed offerwall offers.',
    type: 'DAILY',
    metric: 'OFFERS_ALL',
    recurring: true,
    prizes: [
      machine(1, 1, MINER.cryptoDrill),
      machine(2, 2, MINER.neonHash),
      machine(3, 3, MINER.hashTitan),
      machine(4, 10, MINER.quantumForge),
      boost(11, 25, '150', '24'),
      boost(26, 40, '80', '24'),
      blk(41, 50, '0.001'),
    ],
  },
  {
    id: 'daily-game',
    labelKey: 'adminTournaments.preset_daily_game',
    hintKey: 'adminTournaments.preset_daily_game_hint',
    name: 'Daily Game Tournament',
    description: 'Daily ranking by minigame wins.',
    type: 'DAILY',
    metric: 'MINIGAME_WINS',
    recurring: true,
    prizes: [
      machine(1, 1, MINER.cryptoDrill),
      machine(2, 2, MINER.neonHash),
      machine(3, 3, MINER.hashTitan),
      machine(4, 10, MINER.quantumForge),
      boost(11, 25, '150', '24'),
      boost(26, 40, '80', '24'),
      blk(41, 50, '0.001'),
    ],
  },
  {
    id: 'daily-faucet',
    labelKey: 'adminTournaments.preset_daily_faucet',
    hintKey: 'adminTournaments.preset_daily_faucet_hint',
    name: 'Daily Faucet Tournament',
    description: 'Daily ranking by faucet claims.',
    type: 'DAILY',
    metric: 'FAUCET',
    recurring: true,
    prizes: [blk(1, 1, '25'), blk(2, 3, '10'), blk(4, 10, '3')],
  },
  {
    id: 'daily-shortlink',
    labelKey: 'adminTournaments.preset_daily_shortlink',
    hintKey: 'adminTournaments.preset_daily_shortlink_hint',
    name: 'Daily Shortlink Tournament',
    description: 'Daily ranking by shortlink rewards claimed.',
    type: 'DAILY',
    metric: 'SHORTLINK',
    recurring: true,
    prizes: [machine(1, 1, MINER.titanCore), blk(2, 5, '5'), blk(6, 15, '1')],
  },
  {
    id: 'daily-auto-mining',
    labelKey: 'adminTournaments.preset_daily_auto_mining',
    hintKey: 'adminTournaments.preset_daily_auto_mining_hint',
    name: 'Daily Auto-Mining Tournament',
    description: 'Daily ranking by auto-mining claims.',
    type: 'DAILY',
    metric: 'AUTO_MINING',
    recurring: true,
    prizes: [machine(1, 1, MINER.hashTitan), boost(2, 3, '15', '12'), blk(4, 10, '2')],
  },
  {
    id: 'daily-deposit',
    labelKey: 'adminTournaments.preset_daily_deposit',
    hintKey: 'adminTournaments.preset_daily_deposit_hint',
    name: 'Daily Deposit Tournament',
    description: 'Daily ranking by USD deposits.',
    type: 'DAILY',
    metric: 'DEPOSITS_USD',
    recurring: true,
    prizes: [
      machine(1, 1, MINER.cryptoDrill),
      machine(2, 2, MINER.neonHash),
      machine(3, 3, MINER.hashTitan),
      machine(4, 10, MINER.quantumForge),
      machine(11, 25, MINER.hashTitan),
      machine(26, 50, MINER.quantumForge),
    ],
  },
  {
    id: 'weekly-offerwall',
    labelKey: 'adminTournaments.preset_weekly_offerwall',
    hintKey: 'adminTournaments.preset_weekly_offerwall_hint',
    name: 'Weekly Offerwall Tournament',
    description: 'Weekly ranking by completed offerwall offers.',
    type: 'WEEKLY',
    metric: 'OFFERS_ALL',
    recurring: true,
    prizes: [
      machine(1, 1, MINER.blackNova),
      machine(2, 2, MINER.ironPulse, 2),
      machine(3, 3, MINER.ironPulse),
      machine(4, 10, MINER.neonHash),
      boost(11, 25, '400', '168'),
      boost(26, 40, '200', '24'),
      blk(41, 50, '0.002'),
    ],
  },
  {
    id: 'weekly-game',
    labelKey: 'adminTournaments.preset_weekly_game',
    hintKey: 'adminTournaments.preset_weekly_game_hint',
    name: 'Weekly Game Tournament',
    description: 'Weekly ranking by minigame wins.',
    type: 'WEEKLY',
    metric: 'MINIGAME_WINS',
    recurring: true,
    prizes: [
      machine(1, 1, MINER.blackNova),
      machine(2, 2, MINER.ironPulse, 2),
      machine(3, 3, MINER.ironPulse),
      machine(4, 10, MINER.neonHash),
      boost(11, 25, '400', '168'),
      boost(26, 40, '200', '24'),
      blk(41, 50, '0.002'),
    ],
  },
  {
    id: 'weekly-deposit',
    labelKey: 'adminTournaments.preset_weekly_deposit',
    hintKey: 'adminTournaments.preset_weekly_deposit_hint',
    name: 'Weekly Deposit Tournament',
    description: 'Weekly ranking by USD deposits.',
    type: 'WEEKLY',
    metric: 'DEPOSITS_USD',
    recurring: true,
    prizes: [
      machine(1, 1, MINER.blackNova),
      machine(2, 2, MINER.ironPulse, 2),
      machine(3, 3, MINER.cryptoDrill),
      machine(4, 10, MINER.neonHash),
      machine(11, 25, MINER.hashTitan),
      machine(26, 50, MINER.quantumForge),
    ],
  },
  {
    id: 'monthly-game',
    labelKey: 'adminTournaments.preset_monthly_game',
    hintKey: 'adminTournaments.preset_monthly_game_hint',
    name: 'Monthly Game Tournament',
    description: 'Monthly ranking by minigame wins.',
    type: 'MONTHLY',
    metric: 'MINIGAME_WINS',
    recurring: true,
    prizes: [
      machine(1, 1, MINER.hyperDrill),
      machine(2, 2, MINER.blackNova),
      machine(3, 3, MINER.ironPulse, 2),
      machine(4, 10, MINER.cryptoDrill),
      boost(11, 25, '500', '168'),
      boost(26, 40, '250', '24'),
      blk(41, 50, '0.003'),
    ],
  },
  {
    id: 'monthly-deposit',
    labelKey: 'adminTournaments.preset_monthly_deposit',
    hintKey: 'adminTournaments.preset_monthly_deposit_hint',
    name: 'Monthly Deposit Tournament',
    description: 'Monthly ranking by USD deposits.',
    type: 'MONTHLY',
    metric: 'DEPOSITS_USD',
    recurring: true,
    prizes: [
      machine(1, 1, MINER.hyperDrill),
      machine(2, 2, MINER.blackNova),
      machine(3, 3, MINER.ironPulse, 3),
      machine(4, 10, MINER.cryptoDrill),
      machine(11, 25, MINER.hashTitan),
      machine(26, 50, MINER.quantumForge),
    ],
  },
  {
    id: 'monthly-offerwall',
    labelKey: 'adminTournaments.preset_monthly_offerwall',
    hintKey: 'adminTournaments.preset_monthly_offerwall_hint',
    name: 'Monthly Offerwall Tournament',
    description: 'Monthly ranking by external offerwall offers.',
    type: 'MONTHLY',
    metric: 'OFFERS_EXTERNAL',
    recurring: true,
    prizes: [
      machine(1, 1, MINER.hyperDrill),
      machine(2, 2, MINER.blackNova),
      machine(3, 3, MINER.ironPulse, 2),
      machine(4, 10, MINER.cryptoDrill),
      boost(11, 25, '500', '168'),
      boost(26, 40, '250', '24'),
      blk(41, 50, '0.003'),
    ],
  },
];

export function applyPresetToForm(
  preset: TournamentPreset,
  base: TournamentFormState,
): TournamentFormState {
  return {
    ...base,
    name: preset.name,
    description: preset.description,
    type: preset.type,
    metric: preset.metric,
    recurring: preset.recurring,
    prizes: preset.prizes.map((p) => ({ ...p, key: `${p.key}-${Date.now()}` })),
  };
}
