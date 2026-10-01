import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminAnalyticsPage from './AdminAnalyticsPage';
import { adminAnalyticsApi } from './adminAnalytics.api';
import type {
  AnalyticsPayload,
  DistributionResponse,
  ExecutiveResponse,
  InflationResponse,
  ProjectionsResponse,
  WithdrawalsResponse,
} from './adminAnalytics.types';

const mockOverview: AnalyticsPayload = {
  ok: true,
  polPrice: 0.42,
  summary: {
    totalDistributed: 15000,
    totalDistributedUsd: 6300,
    periodDistributed: 3200,
    periodDistributedUsd: 1344,
    totalWithdrawals: 4000,
    totalWithdrawalsUsd: 1680,
    periodWithdrawals: 800,
    periodWithdrawalsUsd: 336,
    activeUsers: 142,
    blockCount: 4320,
    totalBlocksEver: 25000,
    networkHashRate: 485.5,
    userHashRate: null,
    period: 'month',
  },
  forecast: {
    day: { pol: 100, usd: 42 },
    week: { pol: 700, usd: 294 },
    month: { pol: 3000, usd: 1260 },
    year: { pol: 36500, usd: 15330 },
    sharePercent: 100,
    networkHashRate: 485.5,
    userHashRate: null,
  },
  topEarners: [
    { userId: 1, username: 'MinerPro', total: 1200, totalUsd: 504 },
    { userId: 2, username: 'CryptoKing', total: 850, totalUsd: 357 },
  ],
  chartData: [
    { label: '01/10', value: 100, valueUsd: 42 },
    { label: '02/10', value: 120, valueUsd: 50.4 },
  ],
  userRecentBlocks: null,
};

const mockInflation: InflationResponse = {
  ok: true,
  period: 'month',
  polPrice: 0.42,
  series: [
    { label: '01/10', distributed: 100, withdrawn: 20, net: 80, cumulative: 80 },
  ],
  totals: {
    allTimeDistributed: 15000,
    allTimeWithdrawn: 4000,
    periodDistributed: 3200,
    periodWithdrawn: 800,
    circulatingNet: 11000,
    netInflationRatePercent: 75,
    avgDailyDistributed: 106.6,
    avgDailyWithdrawn: 26.6,
  },
};

const mockProjections: ProjectionsResponse = {
  ok: true,
  period: 'month',
  polPrice: 0.42,
  networkHashRate: 485.5,
  userHashRate: null,
  sharePercent: null,
  theoretical: { day1: 100, day7: 700, day30: 3000, day90: 9000, day365: 36500 },
  empirical: { windowDays: 30, avgDaily: 106.6, day7: 746.2, day30: 3198, day90: 9594 },
  assumptions: { blockRewardPol: 0.3, blocksPerDay: 144 },
};

const mockWithdrawals: WithdrawalsResponse = {
  ok: true,
  period: 'month',
  polPrice: 0.42,
  stats: {
    completedCount: 50,
    totalAmount: 4000,
    avg: 80,
    median: 50,
    p90: 150,
    p99: 400,
    avgTimeToCompleteMs: 120000,
    medianTimeToCompleteMs: 60000,
  },
  statusBreakdownPeriod: { completed: 45, pending: 3, failed: 2, other: 0 },
  series: [{ label: '01/10', count: 5, amount: 200 }],
};

const mockDistribution: DistributionResponse = {
  ok: true,
  period: 'month',
  polPrice: 0.42,
  sources: [
    { key: 'mining', label: 'Mineração (blocos)', pol: 2500, count: 4000, sharePercent: 80 },
    { key: 'referral', label: 'Indicações', pol: 500, count: 120, sharePercent: 16 },
  ],
  totalInflowFromSources: 3000,
  depositsInflow: { key: 'deposits', label: 'Depósitos', pol: 5000, count: 40 },
  outflows: [{ key: 'withdrawals', label: 'Saques', pol: 800, count: 20 }],
  miningExpected: {
    launchDate: '2026-03-05T00:00:00.000Z',
    siteAgeDays: 210,
    rewardBase: 0.3,
    blockDurationMinutes: 10,
    blocksPerDay: 144,
    expectedBlocks: 30240,
    expectedPol: 9072,
    actualBlocks: 28500,
    actualPol: 8550,
    efficiencyPercent: 94.2,
    missingBlocks: 1740,
    missingPol: 522,
  },
};

const mockExecutive: ExecutiveResponse = {
  ok: true,
  executive: {
    siteAgeDays: 210,
    usersTotal: 1500,
    newUsersInPeriod: 120,
    newUsers24h: 15,
    activeMiners: 320,
    totalBlocks: 28500,
    depositsTotal: 25000,
    periodDeposits: 4500,
    withdrawnTotal: 6000,
    withdrawalCount: 75,
    balancesPol: 14000,
    pendingPol: 500,
    pendingCount: 2,
    retentionPercent: 58,
    withdrawalDepositRatioPercent: 24,
    internalSpendPol: 4500,
    avgWithdrawal: 80,
    miningEfficiencyPercent: 94.2,
    theoreticalDailyEmission: 43.2,
    empiricalDailyEmission: 41.5,
    deposits24h: 120,
    withdrawals24h: 40,
    periodDays: 30,
  },
};

describe('AdminAnalyticsPage UI', () => {
  beforeEach(() => {
    vi.spyOn(adminAnalyticsApi, 'getOverview').mockResolvedValue(mockOverview);
    vi.spyOn(adminAnalyticsApi, 'getInflation').mockResolvedValue(mockInflation);
    vi.spyOn(adminAnalyticsApi, 'getProjections').mockResolvedValue(mockProjections);
    vi.spyOn(adminAnalyticsApi, 'getWithdrawals').mockResolvedValue(mockWithdrawals);
    vi.spyOn(adminAnalyticsApi, 'getDistribution').mockResolvedValue(mockDistribution);
    vi.spyOn(adminAnalyticsApi, 'getExecutive').mockResolvedValue(mockExecutive);
    vi.spyOn(adminAnalyticsApi, 'getTrackedWalletsActivity').mockResolvedValue({ wallets: [] });
    vi.spyOn(adminAnalyticsApi, 'searchUsers').mockResolvedValue([
      { id: 42, username: 'GamerGuy', email: 'gamer@example.com' },
    ]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renderiza o cabeçalho, indicador de POL e pílulas de período', async () => {
    render(<AdminAnalyticsPage />);

    expect(screen.getByText('Analytics & Economia')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/1 POL = \$0.4200 USD/i)).toBeInTheDocument();
    });

    expect(screen.getByText('24H')).toBeInTheDocument();
    expect(screen.getByText('7D')).toBeInTheDocument();
    expect(screen.getByText('30D')).toBeInTheDocument();
    expect(screen.getByText('12M')).toBeInTheDocument();
    expect(screen.getByText('Tudo')).toBeInTheDocument();
  });

  it('exibe a faixa de métricas resumidas (distribuído, saques, hashrate e ativos)', async () => {
    render(<AdminAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('485.50 H/s')).toBeInTheDocument();
      expect(screen.getByText('142')).toBeInTheDocument();
    });
  });

  it('permite alternar períodos de consulta (ex.: 7D)', async () => {
    const user = userEvent.setup();
    render(<AdminAnalyticsPage />);

    const weekBtn = screen.getByText('7D');
    await user.click(weekBtn);

    await waitFor(() => {
      expect(adminAnalyticsApi.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ period: 'week' })
      );
    });
  });

  it('permite alternar abas e carrega os dados sob demanda (ex.: Top mineradores)', async () => {
    const user = userEvent.setup();
    render(<AdminAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Top mineradores')).toBeInTheDocument();
    });

    const topUsersTab = screen.getByText('Top mineradores');
    await user.click(topUsersTab);

    await waitFor(() => {
      expect(screen.getByText('MinerPro')).toBeInTheDocument();
      expect(screen.getByText('CryptoKing')).toBeInTheDocument();
    });
  });

  it('permite buscar e selecionar um jogador para filtragem rápida', async () => {
    const user = userEvent.setup();
    render(<AdminAnalyticsPage />);

    const searchInput = screen.getByPlaceholderText(/Buscar usuário por nome/i);
    await user.type(searchInput, 'Gamer');

    await waitFor(() => {
      expect(adminAnalyticsApi.searchUsers).toHaveBeenCalledWith('Gamer', 8);
      expect(screen.getByText('GamerGuy')).toBeInTheDocument();
    });

    const userBtn = screen.getByText('GamerGuy');
    await user.click(userBtn);

    await waitFor(() => {
      expect(adminAnalyticsApi.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42 })
      );
    });
  });

  it('permite atualizar dados através do botão de Atualizar', async () => {
    const user = userEvent.setup();
    render(<AdminAnalyticsPage />);

    const refreshBtn = screen.getByRole('button', { name: /Atualizar/i });
    await user.click(refreshBtn);

    await waitFor(() => {
      expect(adminAnalyticsApi.getOverview).toHaveBeenCalledTimes(2);
    });
  });
});
