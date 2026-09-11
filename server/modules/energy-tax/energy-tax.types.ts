/** Types specific to the energy-tax module. Ported from legacy energyTax.service.ts. */
import type { TaxPayBalances, TaxPayQuotes } from "../../shared/taxPaymentCurrency.js";

export type MiningBreakdown = {
  blockMiner: number; // BlockMinerReward.rewardAmount
  zerads: number; // ZeradsCallback.payoutAmount
  offerwallMe: number; // OfferwallMeCallback.polCredited (status=1)
  offerwallInt: number; // Offer.rewardPolAmount for COMPLETED attempts
  moneyRain: number; // MoneyRainCallback.polCredited — item 82
  total: number;
};

export type ActivityBreakdown = {
  offerwallInt: number;
  offerwallMe: number;
  zeradsClicks: number;
  faucet: number;
  shortlink: number;
  youtube: number;
  games: number;
  moneyRain: number; // MoneyRainCallback count — item 82
  total: number;
  exempt: boolean;
};

/** API-facing shape (kept for client compat — same field names as legacy). */
export type TodayActivities = {
  offerwallExtCount: number;
  offerwallIntCount: number;
  zeradsClicksCount: number;
  faucetCount: number;
  shortlinkCount: number;
  youtubeCount: number;
  gamesCount: number;
  totalActivities: number;
  exempt: boolean;
};

export type EnergyTaxSummary = {
  startsAt: string;
  active: boolean;
  weekStart: string;
  weekEnd: string;
  totalRewards7d: number;
  fullRateTax: number;
  dailyRateTax: number;
  paidPol: number;
  paidDays: number;
  paidDaysManual: number;
  paidDaysAuto: number;
  paidDaysExempt: number;
  unpaidDays: number;
  todayPaid: boolean;
  todayRewards: number;
  yesterdayRewards: number;
  todayDailyCharge: number;
  /** POL / BLK / SHIB quotes for today's manual payment (POL-equivalent charge). */
  todayPayQuotes: TaxPayQuotes;
  balances: TaxPayBalances;
  todayExempt: boolean;
  offerwallExtToday: number;
  offerwallIntToday: number;
  zeradsToday: number;
  faucetToday: number;
  shortlinkToday: number;
  youtubeToday: number;
  gamesToday: number;
  totalActivitiesToday: number;
  todayMiningBreakdown: MiningBreakdown;
  resetHour: number;
  lastClosedPeriodEndKey: string;
  currentPeriodEndKey: string;
  days: Array<{
    dayStart: string;
    periodEndKey: string;
    rewards: number;
    charge: { id: number; mode: string; amount: number; ratePercent: number; status: string; createdAt: string } | null;
  }>;
  history: Array<{
    id: number;
    mode: string;
    amount: number;
    ratePercent: number;
    rewardsBase: number;
    status: string;
    periodDayStartsAt: string;
    createdAt: string;
  }>;
};

export type WeeklySweepResult = { touched: number; chargesCreated: number };
