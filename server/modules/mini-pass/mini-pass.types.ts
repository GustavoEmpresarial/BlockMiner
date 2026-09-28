import type { Prisma, MiniPassSeason, MiniPassLevelReward, MiniPassMission } from "@prisma/client";
import type { TxClient } from "../../core/database/prisma.js";

export type MiniPassSeasonState = "hidden" | "upcoming" | "live" | "ended";

export type MiniPassRewardKind =
  | "NONE"
  | "SHOP_MINER"
  | "EVENT_MINER"
  | "HASHRATE_TEMP"
  | "BLK"
  | "POL";

export type MiniPassMissionCadence = "EVENT" | "DAILY" | "WEEKLY";

export type MiniPassMissionType =
  | "PLAY_GAMES"
  | "MINE_BLK"
  | "LOGIN_DAY"
  | "WATCH_YOUTUBE"
  | "AUTO_MINING_TURBO"
  | "INTERNAL_OFFERWALL";

export type ApplyMiniPassXpInput = {
  userId: number;
  seasonId: number;
  amount: number;
  source: string;
  idempotencyKey: string;
  missionId?: number | null;
  periodKey?: string | null;
  metadataJson?: Prisma.InputJsonValue | null;
  tx?: TxClient | null;
};

export type ApplyMiniPassXpResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; code: string };

export type FulfillRewardResult =
  | { kind: "NONE" }
  | { kind: "SHOP_MINER"; minerName: string }
  | { kind: "EVENT_MINER"; minerName: string }
  | { kind: "HASHRATE_TEMP"; hashRate: number; days: number }
  | { kind: "BLK"; amount: string }
  | { kind: "POL"; amount: string };

export type ClaimRewardResult =
  | { ok: true; duplicate: boolean; summary?: FulfillRewardResult }
  | { ok: false; code: string; status: number };

export type PurchaseLevelsResult =
  | { ok: true; purchaseId: number; polBalance: number }
  | { ok: false; code: string; status: number };

export type PurchaseCompleteResult =
  | { ok: true; purchaseId: number; polBalance: number }
  | { ok: false; code: string; status: number };

export type SeasonSummaryPublic = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  startsAt: string;
  endsAt: string;
  bannerImageUrl: string | null;
  maxLevel: number;
  xpPerLevel: number;
  buyLevelPricePol: string;
  completePassPricePol: string;
  state: MiniPassSeasonState;
};

export type LevelRewardPublic = {
  id: number;
  level: number;
  rewardKind: string;
  title: string;
  minerId: number | null;
  eventMinerId: number | null;
  hashRate: number | null;
  hashRateDays: number | null;
  blkAmount: string | null;
  polAmount: string | null;
  minerName?: string | null;
  claimed?: boolean;
};

export type MissionPublic = {
  id: number;
  cadence: string;
  missionType: string;
  targetValue: number;
  currentValue: number;
  completed: boolean;
  xpReward: number;
  gameSlug: string | null;
  title: string;
  description: string;
};

export type SeasonDashboardResult =
  | {
      ok: true;
      season: SeasonSummaryPublic;
      userProgress: {
        totalXp: number;
        level: number;
        xpInCurrentLevel: number;
        xpNeededForNextLevel: number;
        isMaxLevel: boolean;
      };
      rewards: LevelRewardPublic[];
      missions: MissionPublic[];
    }
  | { ok: false; code: string; status: number };
