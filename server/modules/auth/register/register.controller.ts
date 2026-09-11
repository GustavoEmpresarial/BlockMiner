/**
 * POST /auth/register.
 *
 * Deviations from legacy (documented — see README.md):
 *  - Welcome-miner / starter-rack provisioning (8x welcome miner inventory
 *    rows + UserRoom + 1 visual rack / 8 UserRack slots) IS performed here, in
 *    the same Prisma transaction as the user row, via inventory/index.ts's
 *    `grantPurchasedInventoryItems` and rooms/index.ts's `provisionFirstRoomTx`
 *    — welcome miners fit on the starter rack; more racks are bought/placed later.
 *  - Registration-cooldown risk scoring (register.risk.ts, ported from
 *    legacy's authNetworkSignalService.ts `evaluateRegistrationAttempt`) IS
 *    wired in: same device fingerprint / exact IP / IPv6 network creating too
 *    many accounts in a short window is rejected with 429 before the
 *    duplicate-email/username 409 check even runs. `userIpLog` rows are
 *    recorded in the same provisioning transaction so the next attempt sees
 *    this one. IP intelligence (provider type / ASN) is read via the
 *    `ip-intelligence` module boundary's `getCachedIpIntelligence`.
 */
import type { Request, Response } from "express";
import prisma from "../../../core/database/prisma.js";
import { logger } from "../../../core/logger/index.js";
import { unknownErrorMessage, respondAuthPrismaError } from "../../../shared/errors/prismaHttpErrors.js";
import { AUTH_LOGIN_MESSAGES, buildAuthFailureJson } from "../auth.errors.js";
import {
  normalizeIdentifier,
  normalizeEmail,
  resolveReferrerFromRefInput,
  generateUniqueRefCode,
  ensureWelcomeMiner,
  WELCOME_MINER_QUANTITY,
} from "../auth.repository.js";
import { hashPassword, prismaClientErrorFields } from "../auth.service.js";
import { issueAuthSessionForUser } from "../auth.sessionIssue.js";
import { grantPurchasedInventoryItems } from "../../inventory/index.js";
import { provisionFirstRoomTx } from "../../rooms/index.js";
import { authBlockVpnProxy, evaluateAnonymousIp, getCachedIpIntelligence } from "../../ip-intelligence/index.js";
import { loginClientIp } from "../login/login.anonymous-ip.js";
import { buildDeviceFingerprint, getAuthIpContext, evaluateRegistrationAttempt, recordUserIpLog } from "./register.risk.js";
import { signEmailVerificationToken, APP_URL } from "../auth.service.js";
import { sendEmailVerificationEmail } from "../../../shared/security/mailer.js";

const log = logger.child("RegisterController");

function sanitizeAttr(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  const s = v.trim().slice(0, 255);
  return s || null;
}

export async function registerPost(req: Request, res: Response): Promise<void> {
  try {
    const {
      username,
      email,
      password,
      refCode: refCodeInput,
      utmSource,
      utmMedium,
      utmCampaign,
      referrerDomain,
    } = req.body as {
      username?: unknown;
      email?: unknown;
      password?: unknown;
      refCode?: unknown;
      utmSource?: unknown;
      utmMedium?: unknown;
      utmCampaign?: unknown;
      referrerDomain?: unknown;
    };

    const normalizedUsername = normalizeIdentifier(username);
    const normalizedEmail = normalizeEmail(email);
    const clientIp = loginClientIp(req);
    const deviceFingerprint = buildDeviceFingerprint(req);
    const ipContext = await getAuthIpContext(prisma, clientIp);

    const registrationAttempt = await evaluateRegistrationAttempt(prisma, {
      ip: clientIp,
      networkCidr: ipContext.networkCidr,
      providerType: ipContext.providerType,
      deviceFingerprint,
    });
    if (!registrationAttempt.allowed) {
      log.security(
        "AUTH_REGISTER_COOLDOWN",
        {
          score: registrationAttempt.score,
          reasons: registrationAttempt.reasons,
          recentExactIp: registrationAttempt.recentExactIp,
          recentFingerprint: registrationAttempt.recentFingerprint,
          recentNetwork: registrationAttempt.recentNetwork,
        },
        req,
      );
      res.status(429).json({
        ok: false,
        code: "REGISTRATION_COOLDOWN",
        message: "Too many recent registrations from this network or device. Try again later.",
        cooldownMinutes: registrationAttempt.cooldownMinutes,
      });
      return;
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: normalizedEmail, mode: "insensitive" } },
          { username: { equals: normalizedUsername, mode: "insensitive" } },
          { name: { equals: normalizedUsername, mode: "insensitive" } },
        ],
      },
    });
    if (existing) {
      res.status(409).json({ ok: false, code: "USER_ALREADY_EXISTS", message: "User already exists." });
      return;
    }

    const passwordHash = await hashPassword(String(password ?? ""), 10);
    const refCode = await generateUniqueRefCode();
    let referrerId: number | null = null;

    const freshIpIntel = await getCachedIpIntelligence(prisma, String(clientIp ?? "")).catch(() => null);
    if (authBlockVpnProxy()) {
      const anonymous = evaluateAnonymousIp(freshIpIntel);
      if (anonymous.blocked) {
        log.security("AUTH_REGISTER_VPN_PROXY_DENIED", {
          reason: anonymous.reason,
          proxySource: freshIpIntel?.proxySource ?? null,
          asn: freshIpIntel?.asn ?? null,
          proxyDetected: freshIpIntel?.proxyDetected ?? null,
        }, req);
        res.status(403).json(buildAuthFailureJson("VPN_PROXY_BLOCKED", AUTH_LOGIN_MESSAGES.VPN_PROXY_BLOCKED, {
          reason: anonymous.reason,
        }));
        return;
      }
    }
    const authIpContext = freshIpIntel
      ? { networkCidr: freshIpIntel.networkCidr, asn: freshIpIntel.asn, providerType: freshIpIntel.providerType }
      : ipContext;

    if (refCodeInput) {
      const referrer = await resolveReferrerFromRefInput(refCodeInput);
      if (referrer) {
        if (referrer.ip === clientIp || referrer.registrationIp === clientIp) {
          log.warn("Self-referral attempt blocked", { username: normalizedUsername, clientIp });
        } else {
          referrerId = referrer.id;
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: String(username ?? ""),
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          refCode,
          ...(referrerId ? { referredBy: referrerId } : {}),
          ip: clientIp,
          registrationIp: clientIp,
          userAgent: (req.headers["user-agent"] as string | undefined) || null,
          polBalance: 0,
          usdcBalance: 0,
          utmSource: sanitizeAttr(utmSource),
          utmMedium: sanitizeAttr(utmMedium),
          utmCampaign: sanitizeAttr(utmCampaign),
          referrerDomain: sanitizeAttr(referrerDomain),
        },
      });

      if (referrerId) {
        await tx.referral.create({ data: { referrerId, referredId: user.id } });
      }

      const welcomeMiner = await ensureWelcomeMiner();
      const regNow = new Date();
      await grantPurchasedInventoryItems(
        tx,
        user.id,
        {
          minerId: welcomeMiner.id,
          minerName: welcomeMiner.name,
          level: 1,
          hashRate: welcomeMiner.baseHashRate,
          slotSize: welcomeMiner.slotSize,
          imageUrl: welcomeMiner.imageUrl,
        },
        WELCOME_MINER_QUANTITY,
        regNow,
      );

      await provisionFirstRoomTx(tx, user.id);

      await recordUserIpLog(tx, {
        userId: user.id,
        ip: clientIp,
        networkCidr: authIpContext.networkCidr,
        asn: authIpContext.asn,
        providerType: authIpContext.providerType,
        deviceFingerprint,
        userAgent: (req.headers["user-agent"] as string | undefined) || null,
        eventType: "register",
        now: regNow,
      });

      return user;
    });

    // Consolidated (2026-09-11) onto the same session-issuance path already used, unmodified,
    // by the Google/SatsPay OAuth controllers (see auth.sessionIssue.ts) — was hand-rolled
    // here separately, and unlike login/OAuth did NOT call revokeRefreshTokensForUser /
    // invalidateAuthUserCache / recordAuthLoginSuccess for a fresh account. Those are all
    // harmless no-ops on a brand-new user (no prior tokens/cache/lockout state to touch)
    // except recordAuthLoginSuccess, which now also clears any failed-login counter already
    // built up against this IP — the same thing a Google sign-up from that IP already does.
    // User-approved behavior change (2026-09-11): verified before/after by
    // tests/auth/session-issuance.characterization.test.mjs.
    const session = await issueAuthSessionForUser({ req, res, user: result });
    log.security("AUTH_REGISTER_SUCCESS", { userId: result.id }, req);

    // item 95 Parte B: continua autenticando na hora (não muda a UX de login imediato —
    // evita queda de conversão), mas dispara o email de verificação em paralelo, best-effort.
    // Uma falha de envio aqui não pode derrubar o registro (mesmo padrão dos outros emails
    // do projeto — ver forgot-password/2FA).
    const verifyToken = signEmailVerificationToken(result.id);
    const verifyUrl = `${APP_URL.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(verifyToken)}`;
    sendEmailVerificationEmail({ to: result.email, name: result.name, verifyUrl }).catch((sendErr: unknown) => {
      log.error("Email verification send failed at register", { userId: result.id, error: unknownErrorMessage(sendErr) });
    });

    res.status(201).json({ ok: true, user: { ...session.user, username: normalizedUsername } });
  } catch (error: unknown) {
    const errMsg = unknownErrorMessage(error);
    const { code: prismaCode, meta } = prismaClientErrorFields(error);
    log.error("Register error", { message: errMsg, prismaCode, meta });

    if (prismaCode === "P2002") {
      res.status(409).json({ ok: false, code: "USER_ALREADY_EXISTS", message: "User already exists." });
      return;
    }
    if (respondAuthPrismaError(res, error, AUTH_LOGIN_MESSAGES.SERVICE_UNAVAILABLE)) return;
    res.status(500).json({ ok: false, code: "REGISTRATION_FAILED", message: "auth.register.errors.registration_failed" });
  }
}
