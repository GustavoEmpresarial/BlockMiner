/**
 * Session kill for a VPN/proxy verdict. No Prisma client import — callers pass the tx.
 */
export async function applyAnonymousSessionEviction(
  prisma: {
    user: { update: (args: unknown) => Promise<unknown> };
    refreshToken?: { updateMany: (args: unknown) => Promise<unknown> };
  },
  userId: number,
  onEvicted?: (userId: number) => void,
): Promise<void> {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return;
  await prisma.user.update({ where: { id }, data: { sessionVersion: { increment: 1 } } });
  if (prisma.refreshToken?.updateMany) {
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  onEvicted?.(id);
}
