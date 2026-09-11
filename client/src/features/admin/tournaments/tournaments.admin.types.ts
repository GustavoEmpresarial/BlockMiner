export type TournamentType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export type TournamentMetric =
  | 'HASHRATE'
  | 'BLOCKS_MINED'
  | 'CHECKINS'
  | 'TASKS_COMPLETED'
  | 'DEPOSITS_POL'
  | 'DEPOSITS_USD'
  | 'OFFERS_INTERNAL'
  | 'OFFERS_EXTERNAL'
  | 'OFFERS_ALL'
  | 'MINIGAME_WINS'
  | 'FAUCET'
  | 'SHORTLINK'
  | 'AUTO_MINING';

export type TournamentStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED';

export type PrizeType = 'POL' | 'BLK' | 'MINING_BOOST' | 'MACHINE';

export type CatalogMiner = {
  id: number;
  name: string;
  slug?: string | null;
  imageUrl?: string | null;
  baseHashRate?: number | string | null;
  slotSize?: number | null;
};

export type PrizeDraft = {
  key: string;
  rankFrom: number;
  rankTo: number;
  prizeType: PrizeType;
  polAmount: string;
  blkAmount: string;
  boostHashRate: string;
  boostHours: string;
  minerId: number | null;
  minerName: string;
  minerImageUrl: string | null;
  minerCount: string;
};

export type TournamentPrizeRow = {
  id?: number;
  rankFrom: number;
  rankTo: number;
  prizeType: PrizeType | string;
  polAmount?: string | number | null;
  blkAmount?: string | number | null;
  boostHashRate?: number | null;
  boostHours?: number | null;
  minerId?: number | null;
  minerCount?: number | null;
  miner?: CatalogMiner | null;
};

export type AdminTournament = {
  id: number;
  name: string;
  description?: string | null;
  type: TournamentType;
  metric: TournamentMetric | string;
  startsAt: string;
  endsAt: string;
  status: TournamentStatus;
  recurring: boolean;
  prizes: TournamentPrizeRow[];
  _count?: { entries: number };
};

export type TournamentEntryRow = {
  id: number;
  score: number;
  rank?: number | null;
  rewardGranted?: boolean;
  user?: { id: number; username: string; name?: string | null };
};

export type TournamentFormState = {
  name: string;
  description: string;
  type: TournamentType;
  metric: TournamentMetric;
  startsAt: string;
  endsAt: string;
  recurring: boolean;
  prizes: PrizeDraft[];
};

export const TOURNAMENT_TYPES: TournamentType[] = ['MONTHLY', 'WEEKLY', 'DAILY', 'CUSTOM'];

export const TOURNAMENT_METRICS: TournamentMetric[] = [
  'HASHRATE',
  'BLOCKS_MINED',
  'CHECKINS',
  'TASKS_COMPLETED',
  'DEPOSITS_POL',
  'DEPOSITS_USD',
  'OFFERS_INTERNAL',
  'OFFERS_EXTERNAL',
  'OFFERS_ALL',
  'MINIGAME_WINS',
  'FAUCET',
  'SHORTLINK',
  'AUTO_MINING',
];

export const PRIZE_TYPES: PrizeType[] = ['POL', 'BLK', 'MINING_BOOST', 'MACHINE'];

export function newPrizeKey(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyPrizeDraft(rankFrom = 1, rankTo = 1): PrizeDraft {
  return {
    key: newPrizeKey(),
    rankFrom,
    rankTo,
    prizeType: 'POL',
    polAmount: '',
    blkAmount: '',
    boostHashRate: '',
    boostHours: '',
    minerId: null,
    minerName: '',
    minerImageUrl: null,
    minerCount: '1',
  };
}

export function prizeRowToDraft(p: TournamentPrizeRow): PrizeDraft {
  return {
    key: newPrizeKey(),
    rankFrom: p.rankFrom,
    rankTo: p.rankTo,
    prizeType: (PRIZE_TYPES.includes(p.prizeType as PrizeType) ? p.prizeType : 'POL') as PrizeType,
    polAmount: p.polAmount != null ? String(p.polAmount) : '',
    blkAmount: p.blkAmount != null ? String(p.blkAmount) : '',
    boostHashRate: p.boostHashRate != null ? String(p.boostHashRate) : '',
    boostHours: p.boostHours != null ? String(p.boostHours) : '',
    minerId: p.minerId ?? p.miner?.id ?? null,
    minerName: p.miner?.name ?? '',
    minerImageUrl: p.miner?.imageUrl ?? null,
    minerCount: String(p.minerCount ?? 1),
  };
}

export function draftToApiPrize(p: PrizeDraft): {
  rankFrom: number;
  rankTo: number;
  prizeType: PrizeType;
  polAmount?: number;
  blkAmount?: number;
  boostHashRate?: number;
  boostHours?: number;
  minerId?: number;
  minerCount?: number;
} {
  const base = {
    rankFrom: p.rankFrom,
    rankTo: p.rankTo,
    prizeType: p.prizeType,
  };
  if (p.prizeType === 'POL') {
    return { ...base, polAmount: Number(p.polAmount) || 0 };
  }
  if (p.prizeType === 'BLK') {
    return { ...base, blkAmount: Number(p.blkAmount) || 0 };
  }
  if (p.prizeType === 'MINING_BOOST') {
    return {
      ...base,
      boostHashRate: Number(p.boostHashRate) || 0,
      boostHours: Number(p.boostHours) || 0,
    };
  }
  return {
    ...base,
    minerId: p.minerId ?? undefined,
    minerCount: Number(p.minerCount) || 1,
  };
}

export function toLocalInputValue(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function emptyForm(): TournamentFormState {
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    name: '',
    description: '',
    type: 'DAILY',
    metric: 'OFFERS_ALL',
    startsAt: toLocalInputValue(now),
    endsAt: toLocalInputValue(end),
    recurring: true,
    prizes: [emptyPrizeDraft(1, 1), emptyPrizeDraft(2, 3), emptyPrizeDraft(4, 10)],
  };
}

export function seriesKey(t: Pick<AdminTournament, 'name' | 'type' | 'metric'>): string {
  return `${t.name}::${t.type}::${t.metric}`;
}
