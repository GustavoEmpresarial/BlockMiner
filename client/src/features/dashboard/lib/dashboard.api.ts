import { api } from '../../../shared/auth/auth.store';
import type { DashboardCycleState } from './dashboard.types';

// All endpoints below are real current/server routes (verified against
// current/server/modules/*/*.routes.ts + *.controller.ts + *.service.ts
// before wiring). See DashboardPage.tsx header comment for the full
// legacy-endpoint -> current-endpoint cross-reference, including the one
// legacy call (getRoomsSlotsSummary) that maps onto a REST route that isn't
// mounted in current/server/bootstrap/server.ts yet.

export type WalletBalancePayload = {
  ok?: boolean;
  balance?: unknown;
  polBalance?: unknown;
  blkBalance?: unknown;
  shibBalance?: unknown;
  btcBalance?: unknown;
  ethBalance?: unknown;
  usdtBalance?: unknown;
  usdcBalance?: unknown;
  zerBalance?: unknown;
};

/** GET /api/wallet/balance — current/server's balance.controller.ts getBalance. */
export async function getWalletBalance(): Promise<WalletBalancePayload> {
  const res = await api.get<WalletBalancePayload>('/wallet/balance');
  return res.data;
}

/** GET /api/mining/cycle — replaces legacy's socket-fed useGameStore snapshot.
 *  authenticateTokenOptional: works logged-out too, but `miner` is only
 *  populated when authenticated. */
export async function getMiningCycle(): Promise<{ ok?: boolean } & DashboardCycleState> {
  const res = await api.get<{ ok?: boolean } & DashboardCycleState>('/mining/cycle');
  return res.data;
}

export async function postLinkReferral(refCode: string): Promise<{ ok?: boolean; message?: string }> {
  const res = await api.post<{ ok?: boolean; message?: string }>('/user/link-referral', { refCode });
  return res.data;
}

export type AllocationResponse = {
  ok?: boolean;
  polBps?: number;
  shibBps?: number;
  message?: string;
};

/** PATCH /api/mining/allocation — polBps in 0..10000 (server snaps to nearest 500). */
export async function patchMiningAllocation(polBps: number): Promise<AllocationResponse> {
  const res = await api.patch<AllocationResponse>('/mining/allocation', { polBps });
  return res.data;
}

export type RoomsSlotsSummaryResponse = {
  ok?: boolean;
  totalRacks?: number;
  occupiedRacks?: number;
  freeRacks?: number;
  inventoryCount?: number;
};

/** GET /api/rooms/slots — current/server/modules/rooms/rooms.controller.ts getSlotsSummary. */
export async function getRoomsSlotsSummary(): Promise<RoomsSlotsSummaryResponse> {
  const res = await api.get<RoomsSlotsSummaryResponse>('/rooms/slots');
  return res.data;
}

export type WithdrawFeeInfoResponse = {
  ok?: boolean;
  feePercent?: number;
  feeWaived?: boolean;
  completionsToday?: number;
  requiredForWaiver?: number;
  feeAlreadyChargedToday?: boolean;
};

/** GET /api/wallet/withdraw-fee-info — withdrawal.controller.ts getWithdrawFeeInfo. */
export async function getWithdrawFeeInfo(): Promise<WithdrawFeeInfoResponse> {
  const res = await api.get<WithdrawFeeInfoResponse>('/wallet/withdraw-fee-info');
  return res.data;
}

export type EnergyTaxSummaryResponse = {
  ok?: boolean;
  active?: boolean;
  unpaidDays?: number;
  todayDailyCharge?: number;
  todayPaid?: boolean;
  todayExempt?: boolean;
  yesterdayRewards?: number;
  fullRateTax?: number;
  dailyRateTax?: number;
  totalRewards7d?: number;
  todayPayQuotes?: import('../../taxes/lib/taxPayCurrency').TaxPayQuotes;
};

/** GET /api/energy-tax/summary — energy-tax.controller.ts getSummary.
 *  Deviation from legacy: legacy gated this fetch behind `user.energyHasPendingTax`
 *  from the session payload. current/server's session.auth.controller.ts hardcodes
 *  `energyHasPendingTax: false` (see its own "not yet wired" comment) even though
 *  the energy-tax module itself is real and mounted, so the client flag is not a
 *  usable trigger. The dashboard here fetches the summary directly instead and
 *  decides visibility off the real `active`/`unpaidDays` fields. */
export async function getEnergyTaxSummary(): Promise<EnergyTaxSummaryResponse> {
  const res = await api.get<EnergyTaxSummaryResponse>('/energy-tax/summary');
  return res.data;
}

export type DashboardBannerPayload = {
  id: number | string;
  title: string;
  message?: string | null;
  imageUrl?: string | null;
  link?: string | null;
  linkLabel?: string | null;
  endsAt?: string | null;
};

/** GET /api/banners — banners.controller.ts getActiveBanners (public, no auth). */
export async function getDashboardBanners(): Promise<{ ok?: boolean; banners?: DashboardBannerPayload[] }> {
  const res = await api.get<{ ok?: boolean; banners?: DashboardBannerPayload[] }>('/banners');
  return res.data;
}
