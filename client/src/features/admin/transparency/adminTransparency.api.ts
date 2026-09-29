import { api } from '../../../shared/auth/auth.store';
import type {
  ExternalInvestmentRow,
  CreateExternalInvestmentInput,
  UpdateExternalInvestmentInput,
  TransparencyEntryRow,
  TrackedWalletRow,
  HardwareAssetRow,
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

  // Transparency Entries
  listEntries: () =>
    api.get<{ ok?: boolean; entries?: TransparencyEntryRow[]; message?: string }>('/admin/transparency'),

  // Tracked Wallets
  listTrackedWallets: () =>
    api.get<{ ok: boolean; wallets: TrackedWalletRow[]; message?: string }>(
      '/admin/transparency/tracked-wallets',
    ),

  // Hardware Assets
  listHardwareAssets: () =>
    api.get<{ ok: boolean; assets: HardwareAssetRow[]; message?: string }>(
      '/admin/transparency/hardware-assets',
    ),
};
