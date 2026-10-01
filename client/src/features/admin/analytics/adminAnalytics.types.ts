/**
 * Client-side TypeScript interfaces and contracts for Admin Analytics.
 * In strict 1:1 parity with server/modules/analytics/analytics.types.ts.
 */

export type PeriodKey = 'day' | 'week' | 'month' | 'year' | 'all';

export type TabKey =
  | 'overview'
  | 'financial-flow'
  | 'projections'
  | 'reward-sources'
  | 'top-users'
  | 'executive';

export interface AnalyticsUserRef {
  id: number;
  username?: string | null;
  email?: string | null;
}

export interface AnalyticsSummary {
  totalDistributed: number;
  totalDistributedUsd: number;
  periodDistributed: number;
  periodDistributedUsd: number;
  totalWithdrawals: number;
  totalWithdrawalsUsd: number;
  periodWithdrawals: number;
  periodWithdrawalsUsd: number;
  activeUsers: number | null;
  blockCount: number | null;
  totalBlocksEver: number;
  networkHashRate: number;
  userHashRate?: number | null;
  period: PeriodKey;
}

export interface ForecastPeriod {
  pol: number;
  usd: number;
}

export interface AnalyticsForecast {
  day: ForecastPeriod;
  week: ForecastPeriod;
  month: ForecastPeriod;
  year: ForecastPeriod;
  sharePercent: number | null;
  networkHashRate: number;
  userHashRate: number | null;
}

export interface ChartPoint {
  label: string;
  value: number;
  valueUsd?: number;
}

export interface DualChartPoint {
  label: string;
  up: number;
  down: number;
}

export interface TopEarnerRow {
  userId: number;
  username: string;
  total: number;
  totalUsd: number;
}

export interface UserRecentBlockRow {
  id: number | string;
  blockId?: number | null;
  block?: {
    blockNumber?: number | string | null;
    reward?: number | null;
  } | null;
  rewardAmount: number;
  percentage?: number | null;
  createdAt: string | Date;
}

export interface AnalyticsPayload {
  ok: boolean;
  polPrice: number;
  summary: AnalyticsSummary;
  forecast: AnalyticsForecast;
  topEarners: TopEarnerRow[];
  chartData: ChartPoint[];
  userRecentBlocks: UserRecentBlockRow[] | null;
}

export interface InflationSeriesPoint {
  label: string;
  distributed: number;
  withdrawn: number;
  net: number;
  cumulative: number;
}

export interface InflationTotals {
  allTimeDistributed: number;
  allTimeWithdrawn: number;
  periodDistributed: number;
  periodWithdrawn: number;
  circulatingNet: number;
  netInflationRatePercent: number;
  avgDailyDistributed: number;
  avgDailyWithdrawn: number;
}

export interface InflationResponse {
  ok: boolean;
  period: PeriodKey;
  polPrice: number;
  series: InflationSeriesPoint[];
  totals: InflationTotals;
}

export interface ProjectionsTheoretical {
  day1: number;
  day7: number;
  day30: number;
  day90: number;
  day365: number;
}

export interface ProjectionsEmpirical {
  windowDays: number;
  avgDaily: number;
  avgDailyLast30?: number;
  day7: number;
  day30: number;
  day90: number;
}

export interface ProjectionsAssumptions {
  blockRewardPol: number;
  blocksPerDay: number;
}

export interface ProjectionsResponse {
  ok: boolean;
  period: PeriodKey;
  polPrice: number;
  networkHashRate: number;
  userHashRate: number | null;
  sharePercent: number | null;
  theoretical: ProjectionsTheoretical;
  empirical: ProjectionsEmpirical;
  assumptions: ProjectionsAssumptions;
}

export interface WithdrawalsStats {
  completedCount: number;
  totalAmount: number;
  avg: number;
  median: number;
  p90: number;
  p99: number;
  avgTimeToCompleteMs: number;
  medianTimeToCompleteMs: number;
}

export interface WithdrawalsStatusBreakdown {
  completed: number;
  pending: number;
  failed: number;
  other: number;
}

export interface WithdrawalsSeriesPoint {
  label: string;
  count: number;
  amount: number;
}

export interface WithdrawalsResponse {
  ok: boolean;
  period: PeriodKey;
  polPrice: number;
  stats: WithdrawalsStats;
  statusBreakdownPeriod: WithdrawalsStatusBreakdown;
  series: WithdrawalsSeriesPoint[];
}

export interface DistributionSourceItem {
  key: string;
  label: string;
  pol: number;
  count: number;
  sharePercent: number;
}

export interface MiningExpectedMetrics {
  launchDate: string;
  siteAgeDays: number;
  rewardBase: number;
  blockDurationMinutes: number;
  blocksPerDay: number;
  expectedBlocks: number;
  expectedPol: number;
  actualBlocks: number;
  actualPol: number;
  efficiencyPercent: number;
  missingBlocks: number;
  missingPol: number;
}

export interface InflowOutflowItem {
  key: string;
  label: string;
  pol: number;
  count: number;
}

export interface DistributionResponse {
  ok: boolean;
  period: PeriodKey;
  polPrice: number;
  sources: DistributionSourceItem[];
  totalInflowFromSources: number;
  depositsInflow: InflowOutflowItem;
  outflows: InflowOutflowItem[];
  miningExpected: MiningExpectedMetrics;
}

export interface ExecutiveSummary {
  siteAgeDays: number;
  usersTotal: number;
  newUsersInPeriod: number;
  newUsers24h: number;
  activeMiners: number;
  totalBlocks: number;
  depositsTotal: number;
  periodDeposits: number;
  withdrawnTotal: number;
  withdrawalCount: number;
  balancesPol: number;
  pendingPol: number;
  pendingCount: number;
  retentionPercent: number;
  withdrawalDepositRatioPercent: number;
  internalSpendPol: number;
  avgWithdrawal: number;
  miningEfficiencyPercent: number;
  theoreticalDailyEmission: number;
  empiricalDailyEmission: number;
  deposits24h: number;
  withdrawals24h: number;
  periodDays: number;
}

export interface ExecutiveResponse {
  ok: boolean;
  executive: ExecutiveSummary;
}

export interface WalletActivityPayload {
  wallets?: Array<{
    label?: string | null;
    address?: string;
    summary?: { totalInPol?: number; totalInUsd?: number | null };
  }>;
}
