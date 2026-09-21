import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import HardwareAssetsTab from '../components/HardwareAssetsTab';
import { api } from '../../../../shared/auth/auth.store';
import type {
  HardwareAssetRow,
  HardwareProfitLogRow,
  HardwareRoiSummary,
} from '../components/adminTransparency.types';

vi.mock('../../../../shared/auth/auth.store', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MOCK_ASSETS: HardwareAssetRow[] = [
  {
    id: 1,
    name: 'Antminer S19J Pro #01',
    manufacturer: 'Bitmain',
    purchaseCostUsd: 1500,
    status: 'running',
    description: '104 TH/s SHA-256 Mining Rig',
    sortOrder: 0,
    isActive: true,
  },
  {
    id: 2,
    name: 'Antminer S19 XP #02',
    manufacturer: 'Bitmain',
    purchaseCostUsd: 2800,
    status: 'maintenance',
    description: '141 TH/s High efficiency Rig',
    sortOrder: 1,
    isActive: true,
  },
];

const MOCK_SUMMARY: HardwareRoiSummary = {
  totalEarnedSatoshi: '2500000',
  totalEarnedUsd: 1625,
  purchaseCostUsd: 1500,
  recoveredPct: 108.33,
  remainingUsd: 0,
  roiReached: true,
  avgDailyUsd: 12.5,
  estimatedDaysToRoi: 0,
  firstEarnedAt: '2026-01-01',
  lastEarnedAt: '2026-09-20',
  logCount: 130,
};

const MOCK_LOGS: HardwareProfitLogRow[] = [
  {
    id: 101,
    satoshiAmount: '20000',
    btcUsdPrice: 65000,
    earnedUsd: 13.0,
    earnedAt: '2026-09-20T00:00:00.000Z',
    notes: 'Pool payment via F2Pool',
  },
];

describe('HardwareAssetsTab', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/admin/transparency/hardware-assets') {
        return Promise.resolve({
          data: { ok: true, assets: MOCK_ASSETS },
        });
      }
      if (url === '/admin/transparency/hardware-assets/1/profit-logs') {
        return Promise.resolve({
          data: {
            ok: true,
            profitSummary: MOCK_SUMMARY,
            profitLogs: MOCK_LOGS,
          },
        });
      }
      if (url === '/admin/transparency/btc-usd-price') {
        return Promise.resolve({
          data: { ok: true, priceUsd: 66000 },
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
  });

  it('renders hardware asset list and selected asset ROI summary', async () => {
    render(<HardwareAssetsTab />);

    await waitFor(() => {
      expect(screen.getAllByText('Antminer S19J Pro #01').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Antminer S19 XP #02')).toBeInTheDocument();
    });

    await waitFor(() => {
      // Check ROI summary cards
      expect(screen.getByText('Total Minerado')).toBeInTheDocument();
      expect(screen.getByText('Recuperado (% ROI)')).toBeInTheDocument();
      expect(screen.getByText('Saldo Restante')).toBeInTheDocument();
      expect(screen.getByText('Estimativa de ROI')).toBeInTheDocument();
      expect(screen.getByText(/108.3%/)).toBeInTheDocument();
      expect(screen.getByText(/2500000 sats/i)).toBeInTheDocument();
    });
  });

  it('renders profit logs table with satoshi, BTC price and USD earned', async () => {
    render(<HardwareAssetsTab />);

    await waitFor(() => {
      expect(screen.getByText('Pool payment via F2Pool')).toBeInTheDocument();
      expect(screen.getByText(/20.*000 sats/)).toBeInTheDocument();
      expect(screen.getByText('$65,000.00')).toBeInTheDocument();
    });
  });

  it('fetches real-time BTC price when clicking "Buscar cotação"', async () => {
    render(<HardwareAssetsTab />);

    await waitFor(() => {
      expect(screen.getByText('Buscar cotação')).toBeInTheDocument();
    });

    const fetchPriceBtn = screen.getByText('Buscar cotação');
    fireEvent.click(fetchPriceBtn);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/admin/transparency/btc-usd-price');
    });
  });

  it('opens new hardware asset modal on clicking "Novo Equipamento"', async () => {
    render(<HardwareAssetsTab />);

    await waitFor(() => {
      expect(screen.getByText('Novo Equipamento')).toBeInTheDocument();
    });

    const addBtn = screen.getByText('Novo Equipamento');
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText('Novo Equipamento ASIC')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Antminer S19J Pro/i)).toBeInTheDocument();
    });
  });
});
