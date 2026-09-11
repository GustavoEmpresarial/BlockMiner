import { Prisma } from "@prisma/client";
import {
  REWARD_BLK,
  REWARD_EVENT_MINER,
  REWARD_HASHRATE_TEMP,
  REWARD_NONE,
  REWARD_POL,
  REWARD_SHOP_MINER,
} from "./mini-pass.constants.js";

function positiveInt(n: unknown) {
  const v = parseInt(String(n ?? ""), 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function normalizeDecimalInput(raw: unknown) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.replace(",", ".");
}

function positiveDecimalString(s: unknown) {
  const normalized = normalizeDecimalInput(s);
  if (!normalized) return null;
  try {
    const d = new Prisma.Decimal(normalized);
    return d.gt(0) ? String(d) : null;
  } catch {
    return null;
  }
}

export function nonNegativeDecimalString(s: unknown) {
  const normalized = normalizeDecimalInput(s);
  if (!normalized) return null;
  try {
    const d = new Prisma.Decimal(normalized);
    return d.gte(0) ? String(d) : null;
  } catch {
    return null;
  }
}

export type LevelRewardNormalized = {
  rewardKind: string;
  minerId: number | null;
  eventMinerId: number | null;
  hashRate: number | null;
  hashRateDays: number | null;
  blkAmount: string | null;
  polAmount: string | null;
};

export type ValidateLevelRewardResult =
  | { ok: true; normalized: LevelRewardNormalized }
  | { ok: false; message: string };

export function validateAndNormalizeLevelRewardInput({
  rewardKind,
  minerId,
  eventMinerId,
  hashRate,
  hashRateDays,
  blkAmount,
  polAmount,
}: {
  rewardKind: unknown;
  minerId: unknown;
  eventMinerId: unknown;
  hashRate: unknown;
  hashRateDays: unknown;
  blkAmount: unknown;
  polAmount: unknown;
}): ValidateLevelRewardResult {
  const kind = String(rewardKind || REWARD_NONE).toUpperCase();
  const base: LevelRewardNormalized = {
    rewardKind: kind,
    minerId: null,
    eventMinerId: null,
    hashRate: null,
    hashRateDays: null,
    blkAmount: null,
    polAmount: null,
  };

  if (kind === REWARD_NONE) return { ok: true, normalized: base };

  if (kind === REWARD_SHOP_MINER) {
    const mid = positiveInt(minerId);
    if (!mid) return { ok: false, message: "SHOP_MINER requires a valid minerId." };
    return { ok: true, normalized: { ...base, minerId: mid } };
  }

  if (kind === REWARD_EVENT_MINER) {
    const eid = positiveInt(eventMinerId);
    if (!eid) return { ok: false, message: "EVENT_MINER requires a valid eventMinerId." };
    return { ok: true, normalized: { ...base, eventMinerId: eid } };
  }

  if (kind === REWARD_HASHRATE_TEMP) {
    const hr = Number(hashRate);
    const days = parseInt(String(hashRateDays ?? ""), 10);
    if (!Number.isFinite(hr) || hr <= 0) {
      return { ok: false, message: "HASHRATE_TEMP requires hashRate > 0." };
    }
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return { ok: false, message: "HASHRATE_TEMP requires hashRateDays between 1 and 365." };
    }
    return { ok: true, normalized: { ...base, hashRate: hr, hashRateDays: days } };
  }

  if (kind === REWARD_BLK) {
    const amt = positiveDecimalString(blkAmount);
    if (!amt) return { ok: false, message: "BLK reward requires blkAmount > 0." };
    return { ok: true, normalized: { ...base, blkAmount: amt } };
  }

  if (kind === REWARD_POL) {
    const amt = positiveDecimalString(polAmount);
    if (!amt) return { ok: false, message: "POL reward requires polAmount > 0." };
    return { ok: true, normalized: { ...base, polAmount: amt } };
  }

  return { ok: false, message: "Unknown rewardKind." };
}

export type ValidateMissionInputResult =
  | { ok: true; targetDecimal: string; xpReward: number; gameSlug: string | null }
  | { ok: false; message: string };

export function validateMissionInput({
  targetValue,
  gameSlug,
  xpReward,
}: {
  missionType: unknown;
  targetValue: unknown;
  gameSlug: unknown;
  xpReward: unknown;
}): ValidateMissionInputResult {
  const normalizedTarget = normalizeDecimalInput(targetValue);
  if (!normalizedTarget) return { ok: false, message: "Invalid targetValue." };
  let t: Prisma.Decimal;
  try {
    t = new Prisma.Decimal(normalizedTarget);
  } catch {
    return { ok: false, message: "Invalid targetValue." };
  }
  if (t.lte(0)) return { ok: false, message: "targetValue must be greater than zero." };

  const xp = Math.floor(Number(xpReward) || 0);
  if (!Number.isFinite(xp) || xp < 0 || xp > 1_000_000) {
    return { ok: false, message: "xpReward must be between 0 and 1000000." };
  }

  let slug: string | null = null;
  if (gameSlug != null && String(gameSlug).trim() !== "") {
    const s = String(gameSlug).trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(s)) {
      return { ok: false, message: "gameSlug must be lowercase alphanumeric with hyphens." };
    }
    slug = s;
  }

  return { ok: true, targetDecimal: String(t), xpReward: xp, gameSlug: slug };
}

export function normalizeTitleI18nForMiniPass(obj: unknown) {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const en = typeof o.en === "string" ? o.en.trim() : "";
  const ptBR = typeof o.ptBR === "string" ? o.ptBR.trim() : "";
  const es = typeof o.es === "string" ? o.es.trim() : "";
  const primary = en || ptBR || es;
  if (!primary) return null;
  return { en: en || primary, ptBR: ptBR || primary, es: es || primary };
}

export function normalizeDescriptionI18n(obj: unknown) {
  if (obj == null) return null;
  if (typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const en = typeof o.en === "string" ? o.en.trim() : "";
  const ptBR = typeof o.ptBR === "string" ? o.ptBR.trim() : "";
  const es = typeof o.es === "string" ? o.es.trim() : "";
  if (!en && !ptBR && !es) return null;
  if (!en) return { error: "descriptionI18n.en is required when a description is provided." };
  return { value: { en, ptBR, es } };
}
