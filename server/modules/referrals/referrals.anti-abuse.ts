/**
 * Anti-abuse and fraud prevention engine for referrals.
 * Enforces cluster, subnet, device fingerprint, and IP checks to prevent
 * self-referrals, bot-driven referral farming, and tournament manipulation.
 */
import type { AppPrisma, TxClient } from "../../core/database/prisma.js";
import { normalizeIp, deriveDefaultNetworkCidr, isIpInCidr } from "../ip-intelligence/index.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("referrals.anti-abuse");

export type ReferralFraudCheckInput = {
  referrer: {
    id: number;
    username?: string | null;
    ip?: string | null;
    registrationIp?: string | null;
  };
  refereeIp: string;
  refereeFingerprint?: string | null;
  refereeNetworkCidr?: string | null;
  refereeUserAgent?: string | null;
};

export type ReferralFraudVerdict = {
  allowed: boolean;
  reasons: string[];
};

type AnyPrisma = AppPrisma | TxClient;

function getIpv4Subnet24(ip: string): string | null {
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  return null;
}

/**
 * Evaluates whether a new signup attempting to use `refCode` is a coordinated
 * self-referral or cluster attack from the same person/device/network.
 */
export async function evaluateReferralLinkFraud(
  prisma: AnyPrisma,
  input: ReferralFraudCheckInput,
): Promise<ReferralFraudVerdict> {
  const { referrer, refereeIp, refereeFingerprint, refereeNetworkCidr, refereeUserAgent } = input;
  const reasons: string[] = [];

  const normRefereeIp = normalizeIp(refereeIp);
  const normReferrerIp = normalizeIp(referrer.ip);
  const normReferrerRegIp = normalizeIp(referrer.registrationIp);

  // 1. Exact IP match
  if (normRefereeIp && (normRefereeIp === normReferrerIp || normRefereeIp === normReferrerRegIp)) {
    reasons.push("same_exact_ip");
  }

  // 2. Subnet match (/24 for IPv4, /64 for IPv6)
  if (normRefereeIp && (normReferrerIp || normReferrerRegIp)) {
    const compareIp = normReferrerIp || normReferrerRegIp!;
    const refereeCidr = refereeNetworkCidr || deriveDefaultNetworkCidr(normRefereeIp) || getIpv4Subnet24(normRefereeIp);

    if (refereeCidr && isIpInCidr(compareIp, refereeCidr)) {
      // If in same subnet, check if User-Agent also matches (high confidence same machine/LAN)
      const referrerUser = await (prisma as AppPrisma).user.findUnique({
        where: { id: referrer.id },
        select: { userAgent: true },
      });
      if (referrerUser?.userAgent && refereeUserAgent && referrerUser.userAgent === refereeUserAgent) {
        reasons.push("same_subnet_and_user_agent");
      } else {
        reasons.push("same_network_subnet");
      }
    }
  }

  // 3. Device fingerprint match
  if (refereeFingerprint && refereeFingerprint !== "unknown" && refereeFingerprint.length > 8) {
    // Check if referrer ever had an AntibotSession or UserIpLog with the same fingerprint
    const [matchingSession, matchingIpLog] = await Promise.all([
      (prisma as AppPrisma).antibotSession.findFirst({
        where: {
          userId: referrer.id,
          fingerprint: refereeFingerprint,
        },
        select: { id: true },
      }),
      (prisma as AppPrisma).userIpLog.findFirst({
        where: {
          userId: referrer.id,
          deviceFingerprint: refereeFingerprint,
        },
        select: { id: true },
      }),
    ]);

    if (matchingSession || matchingIpLog) {
      reasons.push("same_device_fingerprint");
    }
  }

  // 4. Multi-account link check (shared wallet address between referrer and any account on this IP)
  if (normRefereeIp) {
    const refereeAccountsOnIp = await (prisma as AppPrisma).user.findMany({
      where: {
        OR: [{ ip: normRefereeIp }, { registrationIp: normRefereeIp }],
        walletAddress: { not: null },
      },
      select: { walletAddress: true },
      take: 10,
    });

    const referrerUser = await (prisma as AppPrisma).user.findUnique({
      where: { id: referrer.id },
      select: { walletAddress: true },
    });

    if (referrerUser?.walletAddress) {
      const sharesWallet = refereeAccountsOnIp.some(
        (acc) => acc.walletAddress && acc.walletAddress.toLowerCase() === referrerUser.walletAddress!.toLowerCase(),
      );
      if (sharesWallet) {
        reasons.push("shared_wallet_address");
      }
    }
  }

  const allowed = reasons.length === 0;
  if (!allowed) {
    log.warn("referral.self_referral_blocked", {
      referrerId: referrer.id,
      referrerUsername: referrer.username,
      refereeIp,
      reasons,
    });
  }

  return { allowed, reasons };
}
