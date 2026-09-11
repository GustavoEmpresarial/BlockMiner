import { buildRankingRows } from "./ranking.hashrate.js";
import * as rankingRepo from "./ranking.repository.js";

export { buildRankingRows } from "./ranking.hashrate.js";

export async function getTopRanking(limit = 50, includeAutoMiningV2: boolean) {
  const now = new Date();
  const users = await rankingRepo.listRankableUsers(now, includeAutoMiningV2);
  return buildRankingRows(users)
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

export async function getUserRoomRankingProfile(username: string) {
  const now = new Date();
  const ROOM_MAX = parseInt(process.env.ROOM_MAX || "4", 10);
  const targetUser = await rankingRepo.findUserRoomProfile(username, now);
  if (!targetUser) return null;

  const mappedMiners = targetUser.miners.map((m) => ({
    id: m.id,
    hashRate: m.hashRate,
    slotIndex: m.slotIndex,
    imageUrl: m.imageUrl,
    level: m.level,
    slotSize: m.slotSize,
    minerName: m.miner?.name || "Miner",
  }));

  const gamePower =
    targetUser.gamePowers.reduce((sum, p) => sum + (p.hashRate || 0), 0) +
    targetUser.ytPowers.reduce((sum, p) => sum + (p.hashRate || 0), 0) +
    (targetUser.gpuAccess || []).reduce((sum, p) => sum + (p.gpuHashRate || 0), 0);

  const racks: Record<number, string | null> = {};
  targetUser.rackConfigs.forEach((config) => {
    racks[config.rackIndex] = config.customName;
  });

  const unlockedRooms = new Set(targetUser.userRooms.map((r) => r.roomNumber));
  const roomList = Array.from({ length: ROOM_MAX }, (_, i) => ({
    roomNumber: i + 1,
    unlocked: unlockedRooms.has(i + 1),
  }));

  return {
    ...targetUser,
    miners: mappedMiners,
    racks,
    gamePower,
    rooms: roomList,
    roomMax: ROOM_MAX,
  };
}
