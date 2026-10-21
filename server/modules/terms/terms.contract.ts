/**
 * "Miner's Contract": the key clauses of the Terms of Use as a gamified scroll. The player stamps
 * each clause and signs; acceptance is stored per terms version. Bump TERMS_CONTRACT_VERSION when
 * the clauses (or the Terms they summarize) change, so everyone signs again.
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("TermsContract");

export const TERMS_CONTRACT_VERSION = "2026-10-19";
/** Clause ids, in order. Texts live in the client locales (profile of the Terms of Use, sections 1, 2, 5, 10, 12). */
export const TERMS_CONTRACT_CLAUSES = ["age", "game", "bots", "rules", "onchain", "withdrawals", "conduct", "security"] as const;

export class TermsContractError extends Error {
  constructor(readonly code: "TERMS_VERSION_MISMATCH" | "TERMS_CLAUSES_INCOMPLETE", readonly status = 400) {
    super(code);
  }
}

export async function getContractStatus(userId: number) {
  const row = await prisma.userTermsAcceptance.findUnique({
    where: { userId_termsVersion: { userId, termsVersion: TERMS_CONTRACT_VERSION } },
    select: { acceptedAt: true },
  });
  return {
    version: TERMS_CONTRACT_VERSION,
    clauses: [...TERMS_CONTRACT_CLAUSES],
    signed: Boolean(row),
    signedAt: row?.acceptedAt.toISOString() ?? null,
    /** Shown on the signed contract. Derived, not secret. */
    certificate: row ? `BM-${String(userId).padStart(6, "0")}-${TERMS_CONTRACT_VERSION.replace(/-/g, "")}` : null,
  };
}

export async function signContract(userId: number, input: { version: unknown; stamped: unknown; requestId?: string | null }) {
  if (input.version !== TERMS_CONTRACT_VERSION) throw new TermsContractError("TERMS_VERSION_MISMATCH", 409);
  const stamped = new Set(Array.isArray(input.stamped) ? input.stamped.filter((v): v is string => typeof v === "string") : []);
  if (!TERMS_CONTRACT_CLAUSES.every((c) => stamped.has(c))) throw new TermsContractError("TERMS_CLAUSES_INCOMPLETE");
  // Idempotent: signing twice keeps the first acceptance time.
  const before = await prisma.userTermsAcceptance.findUnique({ where: { userId_termsVersion: { userId, termsVersion: TERMS_CONTRACT_VERSION } }, select: { acceptedAt: true } });
  if (!before) {
    await prisma.userTermsAcceptance.upsert({
      where: { userId_termsVersion: { userId, termsVersion: TERMS_CONTRACT_VERSION } },
      create: { userId, termsVersion: TERMS_CONTRACT_VERSION, clauseCount: TERMS_CONTRACT_CLAUSES.length },
      update: {},
    });
    log.info("terms.contract.signed", { userId, version: TERMS_CONTRACT_VERSION, requestId: input.requestId ?? null });
  }
  return getContractStatus(userId);
}
