/**
 * Client-side DTO contracts for Admin Faucet management.
 * Strictly aligned 1:1 with server/modules/faucet/faucet.types.ts.
 */

export interface AdminFaucetRewardMiner {
  id: number;
  slug: string;
  name: string;
  baseHashRate: number;
  slotSize: number;
  imageUrl: string | null;
}

export interface AdminFaucetRewardDetail {
  rewardId: number;
  cooldownMs: number;
  isActive: boolean;
  miner: AdminFaucetRewardMiner;
}

export type AdminFaucetConfigResponse =
  | {
      ok: true;
      configured: true;
      reward: AdminFaucetRewardDetail;
    }
  | {
      ok: true;
      configured: false;
      reward: null;
    };

export interface AdminFaucetConfigInput {
  name?: string;
  baseHashRate?: number;
  imageUrl?: string | null;
  cooldownMs?: number;
  isActive?: boolean;
}

export interface AdminFaucetConfigUpdateResponse {
  ok: true;
  message?: string;
  reward: AdminFaucetRewardDetail;
}

export interface FaucetCooldownPreset {
  labelKey: string;
  defaultLabel: string;
  ms: number;
}

export const FAUCET_COOLDOWN_PRESETS: FaucetCooldownPreset[] = [
  { labelKey: 'adminFaucet.presets.15m', defaultLabel: '15 min', ms: 15 * 60 * 1000 },
  { labelKey: 'adminFaucet.presets.30m', defaultLabel: '30 min', ms: 30 * 60 * 1000 },
  { labelKey: 'adminFaucet.presets.1h', defaultLabel: '1 hora', ms: 60 * 60 * 1000 },
  { labelKey: 'adminFaucet.presets.2h', defaultLabel: '2 horas', ms: 2 * 60 * 60 * 1000 },
  { labelKey: 'adminFaucet.presets.4h', defaultLabel: '4 horas', ms: 4 * 60 * 60 * 1000 },
  { labelKey: 'adminFaucet.presets.6h', defaultLabel: '6 horas', ms: 6 * 60 * 60 * 1000 },
  { labelKey: 'adminFaucet.presets.12h', defaultLabel: '12 horas', ms: 12 * 60 * 60 * 1000 },
  { labelKey: 'adminFaucet.presets.24h', defaultLabel: '24 horas', ms: 24 * 60 * 60 * 1000 },
];
