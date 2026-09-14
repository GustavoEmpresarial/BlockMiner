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

/**
 * True when `normalizedEmail` has a non-empty local part before the "@".
 * `"@gmail.com"` is the cheapest form of the suffix attack and is rejected here.
 * Exported for tests/auth/findUserByIdentifier.legacyFallback.test.mjs.
 */
export function hasEmailLocalPart(normalizedEmail: string): boolean {
  return normalizedEmail.indexOf("@") > 0;
}

/**
 * The security rule for the legacy suffix fallback, kept pure so it can be asserted
 * without a database. A stored row only confirms the input when it is the SAME address
 * modulo surrounding whitespace — the real legacy shape. A row whose local part merely
 * *ends with* the input ("joao@gmail.com" vs "o@gmail.com") must never match, because
 * that is what let an unauthenticated caller resolve, and then lock out, someone else's
 * account. Exported for tests/auth/findUserByIdentifier.legacyFallback.test.mjs.
 */
export function isVerifiedLegacyEmailMatch(storedEmail: unknown, normalizedEmail: string): boolean {
  if (!normalizedEmail || !hasEmailLocalPart(normalizedEmail)) return false;
  return String(storedEmail ?? "").trim().toLowerCase() === normalizedEmail;
}

/**
 * SECURITY (fixed 2026-09-13): the legacy fallback below is a suffix match over
 * attacker-controlled input, and it drives authentication lookups.
 *
 * Unguarded — `endsWith(input)` ordered by `id desc` — it resolved an arbitrary account
 * from a bare suffix: `{"identifier":"@gmail.com"}` returned the newest Gmail user, and
 * `"o@gmail.com"` returned `joao@gmail.com`. login.controller.ts then recorded the failed
 * attempt against THAT user, so 10 unauthenticated requests locked a stranger out for an
 * hour (5 failures -> 15min, 10 -> 60min) without the attacker ever learning their address.
 * forgot-password resolves through the same helper, so a reset mail could be aimed at an
 * unintended account too.
 *
 * The fallback is kept (real legacy rows depend on it) but is now only allowed to confirm
 * a row that is the SAME address modulo surrounding whitespace — the actual legacy shape.
 * A candidate whose local part merely ends with the input ("joao" vs "o") is rejected, so
 * neither the untargeted nor the targeted variant resolves anything.
 */
export async function findUserByIdentifier(identifier: unknown) {
  const normalizedEmail = normalizeEmail(identifier);
  const user = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
  });
  if (user) return user;

  // A suffix with no local part ("@gmail.com") can never be a real address — and is the
  // cheapest form of the attack, so reject it before touching the database.
  if (!hasEmailLocalPart(normalizedEmail)) return null;

  // `endsWith` is now only a cheap DB-side prefilter; the decision is made in JS below.
  // Bounded so a broad suffix can't turn into an unbounded scan.
  const candidates = await prisma.user.findMany({
    where: { email: { endsWith: normalizedEmail, mode: "insensitive" } },
    orderBy: { id: "desc" },
    take: 25,
  });
  const matches = candidates.filter((candidate) => isVerifiedLegacyEmailMatch(candidate.email, normalizedEmail));
  // Exactly one, never "the newest of several": picking a winner among ambiguous rows is
  // what let an attacker choose a victim.
  if (matches.length !== 1) {
    if (candidates.length > 0) {
      repositoryLogger.warn("findUserByIdentifier: legacy fallback rejected a non-exact suffix match", {
        identifierSuffix: normalizedEmail.slice(-8),
        candidateCount: candidates.length,
        verifiedMatchCount: matches.length,
      });
    }
    return null;
  }

  const legacyUser = matches[0]!;
  repositoryLogger.warn("findUserByIdentifier: legacy email whitespace fallback matched", {
    identifierSuffix: normalizedEmail.slice(-8),
    userId: legacyUser.id,
  });
  return legacyUser;
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
