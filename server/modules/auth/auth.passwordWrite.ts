/**
 * Password-hash replacement that also kills every existing session.
 * Used by reset / change / admin-force paths so a stolen access+refresh pair
 * cannot survive the password update.
 */
import prisma from "../../core/database/prisma.js";
import { invalidateAuthUserCache } from "../../shared/security/authUser.js";

export async function replacePasswordAndRevokeSessions(
  userId: number,
  passwordHash: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        passwordResetVersion: { increment: 1 },
      },
    });
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });
  invalidateAuthUserCache(userId);
}
