/**
 * Refresh-token persistence. Ported from legacy/server/models/refreshTokenModel.ts.
 * Session module owns refresh-token lifecycle now (see plan decision: legacy
 * auth/session/ merges into this top-level session module).
 */
import prisma from "../../core/database/prisma.js";

export async function createRefreshTokenRecord(input: {
  userId: number;
  tokenId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
}) {
  return prisma.refreshToken.create({
    data: {
      userId: input.userId,
      tokenId: input.tokenId,
      tokenHash: input.tokenHash,
      createdAt: new Date(input.createdAt),
      expiresAt: new Date(input.expiresAt),
    },
  });
}

export async function getRefreshTokenById(tokenId: string) {
  return prisma.refreshToken.findUnique({ where: { tokenId } });
}

export async function revokeRefreshToken(input: { tokenId: string; revokedAt: number; replacedBy?: string | null }) {
  return prisma.refreshToken.update({
    where: { tokenId: input.tokenId },
    data: { revokedAt: new Date(input.revokedAt), replacedBy: input.replacedBy || null },
  });
}

export async function revokeRefreshTokensForUser(userId: number) {
  return prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
