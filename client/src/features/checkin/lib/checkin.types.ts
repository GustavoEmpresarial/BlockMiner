/** Client check-in API shapes — kept under features/checkin. */

export type CheckinPeriodInfo = {
  dateKey: string;
  startsAt?: string;
  endsAt?: string;
  nextResetAt?: string;
  timezone?: string;
  resetHour?: number;
};

export type CheckinMilestoneState = 'locked' | 'eligible' | 'claimed' | 'unavailable';

export type CheckinMilestoneRewardType =
  | 'pol'
  | 'temporary_power'
  | 'machine'
  | 'unavailable'
  | 'unknown';

export type CheckinMilestone = {
  id: number;
  dayThreshold: number;
  milestoneDay?: number;
  rewardType: string;
  rewardValue?: number;
  amount?: number;
  powerAmount?: number | null;
  durationHours?: number | null;
  validityDays?: number | null;
  minerId?: number | null;
  minerName?: string | null;
  minerImageUrl?: string | null;
  minerBaseHashRate?: number | null;
  state?: CheckinMilestoneState;
  status?: CheckinMilestoneState;
  legacyInvalid?: boolean;
  labelKey?: string;
  claimedAt?: string | null;
  sortOrder?: number;
};

export type CheckinCadenceDailySlice = {
  periodKey?: string;
  checkedIn: boolean;
  pending: boolean;
  failed: boolean;
  status: string | null;
  txHash: string | null;
  currentPeriod?: CheckinPeriodInfo | null;
};

export type CheckinStatusPayload = {
  ok?: boolean;
  statusDegraded?: boolean;
  cadenceStatus?: { daily?: CheckinCadenceDailySlice } | null;
  currentPeriod?: CheckinPeriodInfo | null;
  lastCheckin?: {
    dateKey: string;
    confirmedAt: string | null;
    isCurrentPeriod: boolean;
  } | null;
  checkedIn?: boolean;
  todayCheckedIn?: boolean;
  canCheckin?: boolean;
  pending?: boolean;
  failed?: boolean;
  status?: string | null;
  txHash?: string | null;
  streak?: number;
  totalConfirmed?: number;
  recentCheckins?: Array<{
    date: string;
    confirmedAt: string | null;
    paymentMethod: string | null;
    usedGrace: boolean;
    usedFreeze: boolean;
    streak: number;
  }>;
  walletLinked?: boolean;
  savedWallet?: string | null;
  paymentRequired?: boolean;
  checkinMode?: string;
  allowsWalletCheckin?: boolean;
  allowsOffchainCheckin?: boolean;
  nextResetAt?: string;
  graceEndsAt?: string | null;
  checkinReceiver?: string | null;
  checkinContractAddress?: string | null;
  checkinAmountWei?: string;
  checkinBalanceAmountWei?: string;
  chainId?: number;
  checkinChainId?: number;
  rpcConfigured?: boolean;
  milestones?: CheckinMilestone[];
  upcomingMilestones?: CheckinMilestone[];
  polBalance?: number;
  message?: string;
  code?: string;
};

export type CheckinPostPayload = CheckinStatusPayload & {
  alreadyCheckedIn?: boolean;
  paymentMethod?: string;
  cadence?: string;
};
