import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import ptBR from '../../../../i18n/locales/pt-BR.json';
import type { StatsDashboardContext } from '../../lib/stats.types';
import type { UserPowerStatsPayload } from '../../lib/stats.api';

export const i18n = i18next.createInstance();
await i18n.init({ lng: 'pt-BR', resources: { 'pt-BR': { translation: ptBR } }, interpolation: { escapeValue: false } });

export function withProviders(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

export function basePower(overrides: Record<string, unknown> = {}): UserPowerStatsPayload {
  return {
    overview: { totalHashrate: 100, permanentHashrate: 60, temporaryHashrate: 40, nextExpirations: [] },
    machines: { items: [], activeCount: 0, inactiveCount: 0 },
    youtube: { activeTotal: 0, activeItems: [], history: [] },
    games: { minigameTotal: 0, checkinBonusTotal: 0, checkinBonusSlug: '', byGame: [] },
    autoMining: { total: 0, items: [] },
    checkin: { streak: 0, nextHashrateMilestones: [] },
    otherSources: { referralHashrate: 0, stakingHashrate: 0, eventBonusHashrate: 0, note: '' },
    network: {
      userRank: null,
      totalRankedUsers: 0,
      activeUsersLast24h: 0,
      lastBlkCycle: null,
      blkPoolSharePercent: null,
      rewardPerCycle: 0,
      blkPaused: false,
      activityWindowSec: 0,
    },
    payout: { rows: [] },
    history: { miningLogByDay: [], blkCycles: [] },
    projections: { permanentHashrate: 60, temporaryRemainingHashrate: 40, hintKeys: [] },
    analytics: { miningLogPeakShare: 0, miningLogAvgShare: 0, miningLogSamples: 0 },
    ...overrides,
  } as unknown as UserPowerStatsPayload;
}

export function baseContext(overrides: Partial<StatsDashboardContext> = {}): StatsDashboardContext {
  return {
    power: basePower(),
    earnings: undefined,
    earningsLoading: false,
    earningsFilter: '30d',
    setEarningsFilter: () => {},
    ratioBar: { p: 60, tmp: 40 },
    onNavigateTab: () => {},
    onRefetchPower: undefined,
    ...overrides,
  };
}
