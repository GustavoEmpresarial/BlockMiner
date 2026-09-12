import type { TaxPayBalances, TaxPayCurrency, TaxPayQuotes } from "../../shared/taxPaymentCurrency.js";

export const POWER_BOOST_REWARD_SYSTEMS = ["faucet", "shortlinks", "youtube", "autoMining"] as const;

/** Reward source a boosted-TTL grant belongs to — currently informational only (see boosts.service.ts). */
export type PowerBoostRewardSystem = (typeof POWER_BOOST_REWARD_SYSTEMS)[number];

export type PowerBoostStatus = {
  active: boolean;
  dayKey: string;
  costPol: number;
  costQuotes: TaxPayQuotes;
  balances: TaxPayBalances;
  entitlementExpiresAt: string | null;
  currentRewardDurationHours: number;
  normalRewardDurationHours: number;
  boostedRewardDurationHours: number;
};

export type ActivateResult =
  | { ok: false; code: "ALREADY_ACTIVE"; message: string }
  | { ok: false; code: "INSUFFICIENT_BALANCE"; message: string; currency: TaxPayCurrency }
  | {
      ok: true;
      dayKey: string;
      polBalance: number;
      balances: TaxPayBalances;
      currency: TaxPayCurrency;
      feePaid: number;
      entitlementExpiresAt: string;
    };
