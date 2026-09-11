/**
 * Resolve or provision a BlockMiner user from SatsPay userinfo, then ready for session issue.
 */
import crypto from "node:crypto";
import prisma from "../../../core/database/prisma.js";
import { hashPassword } from "../auth.service.js";
import {
  ensureWelcomeMiner,
  findUserBySatspaySubject,
  generateUniqueRefCode,
  normalizeEmail,
  WELCOME_MINER_QUANTITY,
} from "../auth.repository.js";
import { grantPurchasedInventoryItems } from "../../inventory/index.js";
import { provisionFirstRoomTx } from "../../rooms/index.js";
import { pickDisplayName, sanitizeSatspayUsername, type SatspayUserInfo } from "./satspay.pure.js";

async function allocateUniqueUsername(preferred: string): Promise<string> {
  let candidate = sanitizeSatspayUsername(preferred);
  for (let i = 0; i < 12; i += 1) {
    const exists = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: candidate, mode: "insensitive" } },
          { name: { equals: candidate, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    if (!exists) return candidate;
    const suffix = crypto.randomBytes(2).toString("hex");
    candidate = sanitizeSatspayUsername(`${preferred}_${suffix}`);
  }
  return sanitizeSatspayUsername(`sats_${crypto.randomBytes(4).toString("hex")}`);
}

export type ResolveSatspayUserResult =
  | { ok: true; user: { id: number; name: string; username: string | null; email: string; emailVerifiedAt: Date | null; refCode: string | null }; created: boolean }
  | { ok: false; code: "EMAIL_REQUIRED" | "EMAIL_CONFLICT" };

export async function resolveOrCreateUserFromSatspay(args: {
  info: SatspayUserInfo;
  clientIp: string;
  userAgent: string | null;
}): Promise<ResolveSatspayUserResult> {
  const { info, clientIp, userAgent } = args;
  const bySub = await findUserBySatspaySubject(info.sub);
  if (bySub) {
    return {
      ok: true,
      created: false,
      user: {
        id: bySub.id,
        name: bySub.name,
        username: bySub.username,
        email: bySub.email,
        emailVerifiedAt: bySub.emailVerifiedAt,
        refCode: bySub.refCode,
      },
    };
  }

  const email = info.email ? normalizeEmail(info.email) : "";
  if (!email || !email.includes("@")) {
    return { ok: false, code: "EMAIL_REQUIRED" };
  }

  const byEmail = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (byEmail) {
    if (byEmail.satspaySubject && byEmail.satspaySubject !== info.sub) {
      return { ok: false, code: "EMAIL_CONFLICT" };
    }
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        satspaySubject: info.sub,
        ...(info.email_verified && !byEmail.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
      },
    });
    return {
      ok: true,
      created: false,
      user: {
        id: linked.id,
        name: linked.name,
        username: linked.username,
        email: linked.email,
        emailVerifiedAt: linked.emailVerifiedAt,
        refCode: linked.refCode,
      },
    };
  }

  const username = await allocateUniqueUsername(info.username || info.name || email.split("@")[0] || info.sub);
  const displayName = pickDisplayName(info);
  const passwordHash = await hashPassword(crypto.randomBytes(32).toString("hex"), 10);
  const refCode = await generateUniqueRefCode();

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: displayName,
        username,
        email,
        passwordHash,
        refCode,
        satspaySubject: info.sub,
        emailVerifiedAt: info.email_verified ? new Date() : null,
        ip: clientIp,
        registrationIp: clientIp,
        userAgent,
        polBalance: 0,
        usdcBalance: 0,
      },
    });

    const welcomeMiner = await ensureWelcomeMiner();
    const now = new Date();
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
      now,
    );
    await provisionFirstRoomTx(tx, user.id);
    return user;
  });

  return {
    ok: true,
    created: true,
    user: {
      id: created.id,
      name: created.name,
      username: created.username,
      email: created.email,
      emailVerifiedAt: created.emailVerifiedAt,
      refCode: created.refCode,
    },
  };
}
