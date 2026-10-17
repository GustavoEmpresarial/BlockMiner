/**
 * Referral qualification service for tournaments and rewards.
 * Enforces the "Active Referee" policy:
 *  1. Referee must have verified email (emailVerifiedAt != null).
 *  2. Referee must complete at least 10 real activities (faucet, minigames, shortlinks, youtube, offers, checkins).
 *  3. Referee must pass cluster / fraud checks against the referrer.
 *  4. Referee must not be banned.
 *
 * Awards 1 tournament point to the referrer upon qualification via recordTournamentAction.
 * Points can be reversed if fraud or ban is subsequently detected via reverseTournamentAction.
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { recordTournamentAction, reverseTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import { evaluateReferralLinkFraud } from "./referrals.anti-abuse.js";
import { getCachedIpIntelligence, evaluateAnonymousIp } from "../ip-intelligence/index.js";

const log = logger.child("referrals.qualification");

export const REFERRAL_QUALIFICATION_ACTIVITY_THRESHOLD = 10;

export type ReferralQualificationResult = {
  qualified: boolean;
  reason?: string;
  activitiesCount?: number;
  alreadyQualified?: boolean;
};

/**
 * Counts a user's total confirmed activities across all reward features.
 */
export async function countUserTotalActivities(userId: number): Promise<number> {
  const [
    offerwallInt,
    offerwallMe,
    zeradsAgg,
    shortlink,
    youtube,
    games,
    faucetClaims,
    checkins,
  ] = await Promise.all([
    prisma.internalOfferwallAttempt.count({ where: { userId, status: "COMPLETED" } }).catch(() => 0),
    prisma.offerwallMeCallback.count({ where: { userId, status: 1 } }).catch(() => 0),
    prisma.zeradsCallback.aggregate({ _sum: { clicks: true }, where: { userId } }).catch(() => ({ _sum: { clicks: 0 } })),
    prisma.shortlinkPower.count({ where: { userId } }).catch(() => 0),
    prisma.youtubeWatchHistory.count({ where: { userId, status: "granted" } }).catch(() => 0),
    prisma.userPowerGame.count({ where: { userId } }).catch(() => 0),
    prisma.faucetClaim.count({ where: { userId } }).catch(() => 0),
    prisma.dailyCheckin.count({ where: { userId } }).catch(() => 0),
  ]);

  const zeradsClicks = Number(zeradsAgg._sum?.clicks ?? 0);
  const totalCheckins = Number(checkins ?? 0);

  return (
    offerwallInt +
    offerwallMe +
    zeradsClicks +
    shortlink +
    youtube +
    games +
    faucetClaims +
    totalCheckins
  );
}

/**
 * Evaluates whether a referee meets all qualification criteria and grants
 * 1 tournament point to their referrer if qualified.
 */
export async function checkAndQualifyReferral(refereeId: number): Promise<ReferralQualificationResult> {
  const referral = await prisma.referral.findUnique({
    where: { referredId: refereeId },
    include: {
      referrer: {
        select: {
          id: true,
          username: true,
          ip: true,
          registrationIp: true,
          isBanned: true,
        },
      },
      referred: {
        select: {
          id: true,
          username: true,
          email: true,
          emailVerifiedAt: true,
          ip: true,
          registrationIp: true,
          userAgent: true,
          isBanned: true,
        },
      },
    },
  });

  if (!referral) {
    return { qualified: false, reason: "not_referred" };
  }

  const { referrer, referred: referee } = referral;

  if (referee.isBanned) {
    return { qualified: false, reason: "referee_banned" };
  }

  if (referrer.isBanned) {
    return { qualified: false, reason: "referrer_banned" };
  }

  // 1. Email must be verified
  if (!referee.emailVerifiedAt) {
    return { qualified: false, reason: "email_not_verified" };
  }

  // 2. Anti-VPN / Proxy check on referee
  const refereeIps = [referee.registrationIp, referee.ip].filter(Boolean) as string[];
  for (const ip of refereeIps) {
    const intel = await getCachedIpIntelligence(prisma, ip, { cacheOnly: true }).catch(() => null);
    if (intel) {
      const anonVerdict = evaluateAnonymousIp(intel);
      if (anonVerdict.blocked) {
        log.warn("referral.qualification.vpn_blocked", {
          refereeId,
          ip,
          reason: anonVerdict.reason,
        });
        return { qualified: false, reason: `referee_vpn_detected:${anonVerdict.reason}` };
      }
    }
  }

  // 3. Antibot risk score check on referee
  const antibot = await prisma.antibotProfile.findUnique({
    where: { userId: refereeId },
    select: { riskScore: true, peakRiskScore: true },
  }).catch(() => null);
  if (antibot && (antibot.riskScore >= 60 || antibot.peakRiskScore >= 80)) {
    log.warn("referral.qualification.antibot_risk_blocked", { refereeId, riskScore: antibot.riskScore });
    return { qualified: false, reason: `referee_high_bot_risk:${antibot.riskScore}` };
  }

  // 4. Shared IP history check between referrer and referee
  const [referrerLogs, refereeLogs] = await Promise.all([
    prisma.userIpLog.findMany({
      where: { userId: referrer.id },
      select: { ip: true },
      take: 50,
    }).catch(() => []),
    prisma.userIpLog.findMany({
      where: { userId: refereeId },
      select: { ip: true },
      take: 50,
    }).catch(() => []),
  ]);
  const referrerIps = new Set(referrerLogs.map((l) => l.ip).filter(Boolean));
  const hasSharedHistory = refereeLogs.some((l) => l.ip && referrerIps.has(l.ip));
  if (hasSharedHistory) {
    log.warn("referral.qualification.shared_ip_history_blocked", { referrerId: referrer.id, refereeId });
    return { qualified: false, reason: "fraud_cluster:shared_ip_history" };
  }

  // 5. Anti-fraud / cluster validation
  const fraudCheck = await evaluateReferralLinkFraud(prisma, {
    referrer,
    refereeIp: referee.ip || referee.registrationIp || "0.0.0.0",
    refereeUserAgent: referee.userAgent,
  });

  if (!fraudCheck.allowed) {
    log.warn("referral.qualification.fraud_blocked", {
      referrerId: referrer.id,
      refereeId,
      reasons: fraudCheck.reasons,
    });
    return { qualified: false, reason: `fraud_cluster:${fraudCheck.reasons.join(",")}` };
  }

  // 6. Activity threshold check
  const activitiesCount = await countUserTotalActivities(refereeId);
  if (activitiesCount < REFERRAL_QUALIFICATION_ACTIVITY_THRESHOLD) {
    return {
      qualified: false,
      reason: "insufficient_activities",
      activitiesCount,
    };
  }

  // 7. Idempotency: verify if tournament action was already dispatched
  const providerEventId = `ref_${refereeId}`;
  const existingAction = await prisma.tournamentAction.findUnique({
    where: {
      provider_sourceId: {
        provider: TOURNAMENT_ACTION_PROVIDER.REFERRAL,
        sourceId: providerEventId,
      },
    },
    select: { id: true, tournamentEligible: true },
  });

  if (existingAction) {
    return { qualified: true, alreadyQualified: true, activitiesCount };
  }

  // 5. Award tournament point to referrer
  const now = new Date();
  try {
    await recordTournamentAction({
      userId: referrer.id,
      provider: TOURNAMENT_ACTION_PROVIDER.REFERRAL,
      actionCount: 1,
      executedAtUTC: now,
      providerEventId,
      metadata: {
        referrerId: referrer.id,
        refereeId,
        refereeUsername: referee.username,
        activitiesCount,
        qualifiedAt: now.toISOString(),
      },
    });

    log.info("referral.qualification.awarded", {
      referrerId: referrer.id,
      refereeId,
      activitiesCount,
    });

    return { qualified: true, alreadyQualified: false, activitiesCount };
  } catch (err) {
    log.error("referral.qualification.record_failed", {
      referrerId: referrer.id,
      refereeId,
      error: String(err),
    });
    return { qualified: false, reason: "dispatch_failed" };
  }
}

/**
 * Revokes a previously awarded referral tournament point (e.g. if the referee is banned for botting).
 */
export async function revokeReferralQualification(refereeId: number): Promise<{ reversed: boolean }> {
  const providerEventId = `ref_${refereeId}`;
  try {
    const result = await reverseTournamentAction({
      provider: TOURNAMENT_ACTION_PROVIDER.REFERRAL,
      providerEventId,
    });

    log.info("referral.qualification.revoked", {
      refereeId,
      reversedIn: result.reversedIn,
      closedIn: result.closedIn,
    });

    return { reversed: true };
  } catch (err) {
    log.error("referral.qualification.reversal_failed", { refereeId, error: String(err) });
    return { reversed: false };
  }
}

/**
 * Periodic reconciliation: checks pending referrals and awards points when qualified.
 */
export async function reconcilePendingReferralsBatch(limit = 50): Promise<{ evaluated: number; qualifiedCount: number }> {
  const candidates = await prisma.referral.findMany({
    where: {
      referred: {
        emailVerifiedAt: { not: null },
        isBanned: false,
      },
    },
    select: { referredId: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  let qualifiedCount = 0;
  for (const c of candidates) {
    const res = await checkAndQualifyReferral(c.referredId);
    if (res.qualified && !res.alreadyQualified) {
      qualifiedCount++;
    }
  }

  return { evaluated: candidates.length, qualifiedCount };
}
