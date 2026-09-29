import { api } from '../../../shared/auth/auth.store';
import type {
  ExternalInvestmentRow,
  CreateExternalInvestmentInput,
  UpdateExternalInvestmentInput,
  TransparencyEntryRow,
  CreateTransparencyEntryInput,
  UpdateTransparencyEntryInput,
  TrackedWalletRow,
  CreateTrackedWalletInput,
  UpdateTrackedWalletInput,
  UpdateWalletSettingsInput,
  HardwareAssetRow,
  CreateHardwareAssetInput,
  UpdateHardwareAssetInput,
  HardwareProfitLogRow,
  HardwareRoiSummary,
  CreateHardwareProfitLogInput,
  UpdateHardwareProfitLogInput,
} from './components/adminTransparency.types';

export const adminTransparencyApi = {
  // External Investments
  listExternalInvestments: () =>
    api.get<{ ok: boolean; investments?: ExternalInvestmentRow[]; message?: string }>(
      '/admin/transparency/external-investments',
    ),

  createExternalInvestment: (body: CreateExternalInvestmentInput) =>
    api.post<{ ok: boolean; investment?: ExternalInvestmentRow; message?: string }>(
      '/admin/transparency/external-investments',
      body,
    ),

  updateExternalInvestment: (id: number, body: UpdateExternalInvestmentInput) =>
    api.patch<{ ok: boolean; investment?: ExternalInvestmentRow; message?: string }>(
      `/admin/transparency/external-investments/${id}`,
      body,
    ),

  deleteExternalInvestment: (id: number) =>
    api.delete<{ ok: boolean; message?: string }>(`/admin/transparency/external-investments/${id}`),

  toggleExternalInvestment: (id: number, isActive: boolean) =>
    api.patch<{ ok: boolean; investment?: ExternalInvestmentRow; message?: string }>(
      `/admin/transparency/external-investments/${id}`,
      { isActive },
    ),

  // Image upload
  uploadImage: async (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    const { data } = await api.post<{ ok: boolean; url: string; message?: string }>(
      '/admin/upload-image?category=transparency',
      fd,
    );
    if (!data.ok || !data.url) {
      throw new Error(data.message ?? 'Falha no upload da imagem.');
    }
    return data.url;
  },

  // Transparency Entries (Balanço: Despesas & Receitas)
  listEntries: () =>
    api.get<{ ok?: boolean; entries?: TransparencyEntryRow[]; message?: string }>('/admin/transparency'),

  createEntry: (body: CreateTransparencyEntryInput) =>
    api.post<{ ok: boolean; entry?: TransparencyEntryRow; message?: string }>('/admin/transparency', body),

  updateEntry: (id: number, body: UpdateTransparencyEntryInput) =>
    api.put<{ ok: boolean; entry?: TransparencyEntryRow; message?: string }>(`/admin/transparency/${id}`, body),

  deleteEntry: (id: number) =>
    api.delete<{ ok: boolean; message?: string }>(`/admin/transparency/${id}`),

  // Main Wallet Settings & Live Activity
  getWalletSettings: () =>
    api.get<{ ok: boolean; address: string | null; message?: string }>('/admin/transparency/wallet/settings'),

  updateWalletSettings: (body: UpdateWalletSettingsInput) =>
    api.put<{ ok: boolean; address: string | null; message?: string }>(
      '/admin/transparency/wallet/settings',
      body,
    ),

  getWalletActivity: () =>
    api.get<{ ok: boolean; activity?: unknown; message?: string }>('/admin/transparency/wallet/activity'),

  // Tracked Wallets
  listTrackedWallets: () =>
    api.get<{ ok: boolean; wallets: TrackedWalletRow[]; message?: string }>(
      '/admin/transparency/tracked-wallets',
    ),

  createTrackedWallet: (body: CreateTrackedWalletInput) =>
    api.post<{ ok: boolean; wallet?: TrackedWalletRow; message?: string }>(
      '/admin/transparency/tracked-wallets',
      body,
    ),

  updateTrackedWallet: (id: number, body: UpdateTrackedWalletInput) =>
    api.put<{ ok: boolean; wallet?: TrackedWalletRow; message?: string }>(
      `/admin/transparency/tracked-wallets/${id}`,
      body,
    ),

  deleteTrackedWallet: (id: number) =>
    api.delete<{ ok: boolean; message?: string }>(`/admin/transparency/tracked-wallets/${id}`),

  // Hardware Assets (Mineração Física ASIC)
  listHardwareAssets: () =>
    api.get<{ ok: boolean; assets: HardwareAssetRow[]; message?: string }>(
      '/admin/transparency/hardware-assets',
    ),

  createHardwareAsset: (body: CreateHardwareAssetInput) =>
    api.post<{ ok: boolean; asset?: HardwareAssetRow; message?: string }>(
      '/admin/transparency/hardware-assets',
      body,
    ),

  updateHardwareAsset: (id: number, body: UpdateHardwareAssetInput) =>
    api.put<{ ok: boolean; asset?: HardwareAssetRow; message?: string }>(
      `/admin/transparency/hardware-assets/${id}`,
      body,
    ),

  deleteHardwareAsset: (id: number) =>
    api.delete<{ ok: boolean; message?: string }>(`/admin/transparency/hardware-assets/${id}`),

  // Hardware Profit Logs & BTC Price
  getBtcUsdPrice: () =>
    api.get<{ ok: boolean; priceUsd: number; source?: string; message?: string }>(
      '/admin/transparency/btc-usd-price',
    ),

  listProfitLogs: (assetId: number) =>
    api.get<{
      ok: boolean;
      profitSummary: HardwareRoiSummary;
      profitLogs: HardwareProfitLogRow[];
      message?: string;
    }>(`/admin/transparency/hardware-assets/${assetId}/profit-logs`),

  createProfitLog: (assetId: number, body: CreateHardwareProfitLogInput) =>
    api.post<{ ok: boolean; profitLog?: HardwareProfitLogRow; message?: string }>(
      `/admin/transparency/hardware-assets/${assetId}/profit-logs`,
      body,
    ),

  updateProfitLog: (assetId: number, id: number, body: UpdateHardwareProfitLogInput) =>
    api.put<{ ok: boolean; profitLog?: HardwareProfitLogRow; message?: string }>(
      `/admin/transparency/hardware-assets/${assetId}/profit-logs/${id}`,
      body,
    ),

  deleteProfitLog: (assetId: number, id: number) =>
    api.delete<{ ok: boolean; message?: string }>(
      `/admin/transparency/hardware-assets/${assetId}/profit-logs/${id}`,
    ),
};
