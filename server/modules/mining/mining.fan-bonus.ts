/**
 * Cooling-fan bonus: +1% of the hashrate of every active machine sitting in a visual rack that
 * has a fan mounted under it. One rack = 8 slots (position visualIndex*8 .. visualIndex*8+7).
 *
 * Single source of truth: the mining engine (what is paid) and the ranking / tournament /
 * power-stats views (what is shown) must agree, so both call this.
 */
import prisma from "../../core/database/prisma.js";

export const FAN_BONUS_RATE = 0.01;
export const RACK_SLOTS_PER_VISUAL_RACK = 8;

export type FanPlacementRow = { roomId: number; visualIndex: number };
export type RackSlotRow = { roomId: number; position: number; userMiner?: { hashRate?: unknown } | null };

export function computeFanBonusFromRows(fans: FanPlacementRow[], slots: RackSlotRow[]): number {
  if (fans.length === 0 || slots.length === 0) return 0;
  const fanSet = new Set(fans.map((f) => `${f.roomId}:${f.visualIndex}`));
  let bonus = 0;
  for (const slot of slots) {
    const visualIndex = Math.floor(slot.position / RACK_SLOTS_PER_VISUAL_RACK);
    if (!fanSet.has(`${slot.roomId}:${visualIndex}`)) continue;
    const hr = Number(slot.userMiner?.hashRate) || 0;
    if (hr > 0) bonus += hr * FAN_BONUS_RATE;
  }
  return bonus;
}

/**
 * Fan bonus for many users with two queries (fans are rare, so racks are only loaded for the
 * users that have at least one fan). Users without fans are absent from the map (= 0).
 */
export async function loadFanBonusByUser(userIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (userIds.length === 0) return out;
  const fans = await prisma.userVisualFanPlacement.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, roomId: true, visualIndex: true },
  });
  if (fans.length === 0) return out;
  const fanUsers = [...new Set(fans.map((f) => f.userId))];
  const slots = await prisma.userRack.findMany({
    where: { userId: { in: fanUsers }, userMiner: { isActive: true } },
    select: { userId: true, roomId: true, position: true, userMiner: { select: { hashRate: true } } },
  });
  for (const uid of fanUsers) {
    const bonus = computeFanBonusFromRows(
      fans.filter((f) => f.userId === uid),
      slots.filter((s) => s.userId === uid),
    );
    if (bonus > 0) out.set(uid, bonus);
  }
  return out;
}
