/**
 * Auth repository — identity lookups + referral/welcome-miner helpers.
 * Restored alongside SatsPay OAuth (source was missing; behavior matches dist/).
 */
import crypto from "node:crypto";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";

const repositoryLogger = logger.child("AuthRepository");

export function normalizeIdentifier(value: unknown): string {
  return String(value || "").trim();
}

export function normalizeEmail(value: unknown): string {
  return normalizeIdentifier(value).toLowerCase();
}

export async function findUserByIdentifier(identifier: unknown) {
  const normalizedEmail = normalizeEmail(identifier);
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
  });
  if (user) return user;

  const legacyUser = await prisma.user.findFirst({
    where: { email: { endsWith: normalizedEmail, mode: "insensitive" } },
    orderBy: { id: "desc" },
  });
  if (legacyUser) {
    repositoryLogger.warn("findUserByIdentifier: legacy email endsWith fallback matched", {
      identifierSuffix: normalizedEmail.slice(-8),
      userId: legacyUser.id,
    });
  }
  return legacyUser ?? null;
}

export async function findUserBySatspaySubject(subject: string) {
  const sub = String(subject || "").trim();
  if (!sub) return null;
  return prisma.user.findUnique({ where: { satspaySubject: sub } });
}

export async function findUserByGoogleSubject(subject: string) {
  const sub = String(subject || "").trim();
  if (!sub) return null;
  return prisma.user.findUnique({ where: { googleSubject: sub } });
}

export async function resolveReferrerFromRefInput(refCodeInput: unknown) {
  const raw = String(refCodeInput ?? "").trim();
  if (!raw) return null;
  return prisma.user.findUnique({ where: { refCode: raw } });
}

export async function generateUniqueRefCode(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = crypto.randomBytes(5).toString("hex");
    const exists = await prisma.user.findUnique({ where: { refCode: code } });
    if (!exists) return code;
  }
  throw new Error("Unable to generate referral code");
}

const WELCOME_MINER_SLUG = "welcome-10ghs";
const WELCOME_MINER_NAME = "Welcome Miner";
const WELCOME_MINER_HASH_RATE = 10;
const WELCOME_MINER_SLOT_SIZE = 1;
const WELCOME_MINER_IMAGE_URL = "/media/miners/reward1.webp";
export const WELCOME_MINER_QUANTITY = 8;

export async function ensureWelcomeMiner() {
  let miner = await prisma.miner.findUnique({ where: { slug: WELCOME_MINER_SLUG } });
  if (!miner) {
    miner = await prisma.miner.create({
      data: {
        name: WELCOME_MINER_NAME,
        slug: WELCOME_MINER_SLUG,
        baseHashRate: WELCOME_MINER_HASH_RATE,
        price: 0,
        slotSize: WELCOME_MINER_SLOT_SIZE,
        imageUrl: WELCOME_MINER_IMAGE_URL,
        isActive: true,
        showInShop: false,
      },
    });
  }
  return miner;
}
