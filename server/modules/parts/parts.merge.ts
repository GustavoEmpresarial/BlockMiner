/**
 * Merge spends two plates of the same rarity and charges a share of the catalog
 * base price (Miner.price, BLK). The granted machine stores base hash × (1 + boost).
 * Basis points match Decimal(20,8): 10_000 bps = 100%.
 */
import type { Prisma } from "@prisma/client";
import { HttpStatusError } from "../../shared/errors/httpStatusError.js";
import { PART_RARITY, isPartRarity, isPartSlug, type PartRarity, type PartSlug } from "./parts.catalog.js";
import type { PartCost } from "./parts.machinePrices.js";
import { PARTS_ERROR_CODE } from "./parts.errors.js";

export const PARTS_MERGE_FEE_BPS_ENV_KEY = "PARTS_MERGE_FEE_BPS";
export const PARTS_MERGE_HASHRATE_BOOST_BPS_ENV_KEY = "PARTS_MERGE_HASHRATE_BOOST_BPS";

/** 10% of Miner.price. */
export const DEFAULT_MERGE_FEE_BASIS_POINTS = 1_000;
/** +30% on the catalog base hashrate. */
export const DEFAULT_MERGE_HASHRATE_BOOST_BASIS_POINTS = 3_000;

export const BASIS_POINT_SCALE = 10_000;
/** Miner.price and UserOwnedMachine.hashRate are Decimal(20,8). */
export const MERGE_DECIMAL_PLACES = 8;
const MINOR_UNITS = 10 ** MERGE_DECIMAL_PLACES;

/** Fee cannot exceed the base price. A bad env falls back to the product default. */
const MAX_MERGE_FEE_BASIS_POINTS = BASIS_POINT_SCALE;
/** Boost above 10× the base hashrate is treated as a bad env, not a product rule. */
const MAX_MERGE_HASHRATE_BOOST_BASIS_POINTS = 100_000;

/** One catalog machine per merge. */
export const MERGE_QUANTITY = 1;

/** The forge takes two plates, and both must be the same rarity. */
export const MERGE_PLATE_COUNT = 2;

/** Catalog miners and offer-event miners are different tables and can share a numeric id. */
export const MERGE_MACHINE_SOURCE = {
  catalog: "catalog",
  offer: "offer",
} as const;

export type MergeMachineSource = (typeof MERGE_MACHINE_SOURCE)[keyof typeof MERGE_MACHINE_SOURCE];

/** Known reward or system miners that cannot be merged. */
export const MERGE_EXCLUDED_MINER_SLUGS = [
  "shortlink-5hs-reward",
  "shortlink-100hs-reward",
  "shortlink-5ghs-reward",
  "faucet-micro-miner",
  "faucet-1ghs",
  "streamer-miner",
  "basic-usb-miner",
];

/** Offer-event machines that never merge (test offers, 3D GLB models like MinerCore MCX9). */
export const MERGE_EXCLUDED_EVENT_MINER_IDS = [5, 32];

/** Owned copies obtained from these free reward flows can never be merged, whatever the model. */
export const MERGE_EXCLUDED_ACQUISITION_SOURCES = ["faucet", "youtube", "youtuber_reward"];

/** Live catalog rows, including ones hidden from the shop, excluding non-mergeable reward miners. */
export const MERGE_CATALOG_WHERE: Prisma.MinerWhereInput = {
  isActive: true,
  isArchived: false,
  slug: {
    notIn: MERGE_EXCLUDED_MINER_SLUGS,
  },
  NOT: [
    { name: { contains: "Shortlink Reward", mode: "insensitive" } },
    { name: { contains: "Faucet", mode: "insensitive" } },
    { name: { contains: "YouTube", mode: "insensitive" } },
  ],
};

/**
 * Owned machines stay mergeable after leaving the shop (isActive=false);
 * only archived rows and reward miners are excluded.
 */
export const MERGE_OWNED_CATALOG_WHERE: Prisma.MinerWhereInput = {
  isArchived: false,
  // A machine without a base price would merge for a zero fee.
  price: { gt: 0 },
  slug: {
    notIn: MERGE_EXCLUDED_MINER_SLUGS,
  },
  NOT: [
    { name: { contains: "Shortlink Reward", mode: "insensitive" } },
    { name: { contains: "Faucet", mode: "insensitive" } },
    { name: { contains: "YouTube", mode: "insensitive" } },
  ],
};

export type MergePlate = { slug: PartSlug; rarity: PartRarity };

/** Same compare-and-swap window the shop purchase uses before giving up on stock. */
export const MERGE_STOCK_CAS_ATTEMPTS = 10;

export const PARTS_MERGE_ACQUISITION_SOURCE = "parts_merge";

type BasisPointEnv = string | undefined | null;

function readBasisPoints(raw: BasisPointEnv, fallback: number, max: number): number {
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0 || n > max) return fallback;
  return n;
}

export function readMergeFeeBasisPoints(
  raw: BasisPointEnv = process.env[PARTS_MERGE_FEE_BPS_ENV_KEY],
): number {
  return readBasisPoints(raw, DEFAULT_MERGE_FEE_BASIS_POINTS, MAX_MERGE_FEE_BASIS_POINTS);
}

export function readMergeHashrateBoostBasisPoints(
  raw: BasisPointEnv = process.env[PARTS_MERGE_HASHRATE_BOOST_BPS_ENV_KEY],
): number {
  return readBasisPoints(raw, DEFAULT_MERGE_HASHRATE_BOOST_BASIS_POINTS, MAX_MERGE_HASHRATE_BOOST_BASIS_POINTS);
}

export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * MINOR_UNITS);
}

export function fromMinorUnits(minor: number): number {
  return minor / MINOR_UNITS;
}

/** Round `amount * basisPoints / 10_000` to 8 decimal places. Non-positive amounts stay 0. */
export function applyBasisPoints(amount: number, basisPoints: number): number {
  const minor = toMinorUnits(amount);
  if (minor <= 0 || !Number.isInteger(basisPoints) || basisPoints <= 0) return 0;
  const scaled = Math.round((minor * basisPoints) / BASIS_POINT_SCALE);
  return fromMinorUnits(scaled);
}

export function mergeFeeBlk(
  basePrice: number,
  feeBasisPoints: number = readMergeFeeBasisPoints(),
): number {
  return applyBasisPoints(basePrice, feeBasisPoints);
}

export function mergedHashRate(
  baseHashRate: number,
  boostBasisPoints: number = readMergeHashrateBoostBasisPoints(),
): number {
  if (!Number.isFinite(baseHashRate) || baseHashRate <= 0) return 0;
  if (!Number.isInteger(boostBasisPoints) || boostBasisPoints < 0) return 0;
  // Merging consumes 2 identical machines: combined power = baseHashRate * 2
  const combined = baseHashRate * 2;
  const minor = Math.round(combined * MINOR_UNITS);
  const scaled = Math.round((minor * (BASIS_POINT_SCALE + boostBasisPoints)) / BASIS_POINT_SCALE);
  return fromMinorUnits(scaled);
}

type PartStackWriter = {
  userPartStack: {
    updateMany(args: {
      where: { userId: number; partSlug: string; rarity: string; quantity: { gte: number } };
      data: { quantity: { decrement: number } };
    }): Promise<{ count: number }>;
  };
};

/** Missing source stays on the catalog. Anything else is not a machine the forge can grant. */
export function parseMergeMachineSource(raw: unknown): MergeMachineSource {
  if (raw == null || raw === "") return MERGE_MACHINE_SOURCE.catalog;
  if (raw === MERGE_MACHINE_SOURCE.catalog || raw === MERGE_MACHINE_SOURCE.offer) return raw;
  throw new HttpStatusError(400, "This machine is not available.", { code: PARTS_ERROR_CODE.INVALID_MINER });
}

function rejectPlates(status: number, message: string, code: string): never {
  throw new HttpStatusError(status, message, { code });
}

/** Two known plates that share a rarity. Anything else is rejected before the lock. */
export function parseMergePlates(raw: unknown): MergePlate[] {
  if (!Array.isArray(raw) || raw.length !== MERGE_PLATE_COUNT) {
    rejectPlates(400, "Merge needs two plates of the same rarity.", PARTS_ERROR_CODE.INVALID_PLATES);
  }
  const plates: MergePlate[] = [];
  for (const item of raw) {
    const slug = item != null && typeof item === "object" && "slug" in item ? String(item.slug) : "";
    const rarity = item != null && typeof item === "object" && "rarity" in item ? String(item.rarity) : "";
    if (!isPartSlug(slug) || !isPartRarity(rarity)) {
      rejectPlates(400, "Merge needs two plates of the same rarity.", PARTS_ERROR_CODE.INVALID_PLATES);
    }
    plates.push({ slug, rarity });
  }
  const left = plates[0];
  const right = plates[1];
  if (!left || !right || left.rarity !== right.rarity) {
    rejectPlates(409, "The two plates must share a rarity.", PARTS_ERROR_CODE.RARITY_MISMATCH);
  }
  return plates;
}

export function mergePlateSpends(plates: readonly MergePlate[]): { slug: PartSlug; rarity: PartRarity; required: number }[] {
  const totals = new Map<string, { slug: PartSlug; rarity: PartRarity; required: number }>();
  for (const plate of plates) {
    const key = `${plate.slug}:${plate.rarity}`;
    const current = totals.get(key);
    if (current) current.required += 1;
    else totals.set(key, { slug: plate.slug, rarity: plate.rarity, required: 1 });
  }
  return [...totals.values()].sort((a, b) => a.slug.localeCompare(b.slug) || a.rarity.localeCompare(b.rarity));
}

export async function spendMergePlatesInTx(
  tx: PartStackWriter,
  userId: number,
  plates: readonly MergePlate[],
): Promise<void> {
  for (const cost of mergePlateSpends(plates)) {
    const updated = await tx.userPartStack.updateMany({
      where: { userId, partSlug: cost.slug, rarity: cost.rarity, quantity: { gte: cost.required } },
      data: { quantity: { decrement: cost.required } },
    });
    if (updated.count !== 1) {
      throw new HttpStatusError(409, "Not enough parts to merge this machine.", {
        code: PARTS_ERROR_CODE.INSUFFICIENT_PARTS,
      });
    }
  }
}

export async function spendPartStacksInTx(
  tx: PartStackWriter,
  userId: number,
  costs: readonly PartCost[],
): Promise<void> {
  const ordered = [...costs].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const cost of ordered) {
    if (!Number.isInteger(cost.required) || cost.required <= 0) continue;
    const updated = await tx.userPartStack.updateMany({
      where: { userId, partSlug: cost.slug, rarity: PART_RARITY.common, quantity: { gte: cost.required } },
      data: { quantity: { decrement: cost.required } },
    });
    if (updated.count !== 1) {
      throw new HttpStatusError(409, "Not enough parts to merge this machine.", {
        code: PARTS_ERROR_CODE.INSUFFICIENT_PARTS,
      });
    }
  }
}

/** Filter for userOwnedMachine rows that may enter the merge forge. */
export const MERGE_OWNED_MACHINE_WHERE: Prisma.UserOwnedMachineWhereInput = {
  OR: [
    { acquisitionSource: null },
    { acquisitionSource: { notIn: MERGE_EXCLUDED_ACQUISITION_SOURCES } },
  ],
};

/** Offer-event machines merge like catalog ones, as long as they were sold for a price (free giveaways and 3D models never merge). */
export function isMergeableOfferMiner(em: {
  id?: number;
  name?: string;
  modelUrl?: string | null;
  price: unknown;
  isFree?: boolean | null;
  event?: { deletedAt: Date | null } | null;
}): boolean {
  if (em.id != null && MERGE_EXCLUDED_EVENT_MINER_IDS.includes(em.id)) return false;
  if (em.isFree) return false;
  if (em.event?.deletedAt) return false;
  // 3D models cannot be merged (user instruction: "essas 3d não pode")
  if (em.modelUrl != null && String(em.modelUrl).trim() !== "") return false;
  const name = String(em.name ?? "").toLowerCase();
  if (name.includes("mcx9") || name.includes("minercore")) return false;
  const price = Number(em.price);
  return Number.isFinite(price) && price > 0;
}
