import type { TFunction } from 'i18next';
import type { TournamentPrize } from './tournaments.types';
import { formatHashrate } from '../../ranking/lib/ranking.utils';

/** Format tournament prize amounts for display (supports tiny BLK like 0.001). */
export function formatTournamentTokenAmount(raw: string | number | null | undefined): string {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0';
  if (Math.abs(n) >= 0.01) return n.toFixed(2).replace(/\.?0+$/, '');
  // Keep enough decimals for sub-cent BLK/POL prizes, strip trailing zeros.
  return n.toFixed(8).replace(/\.?0+$/, '');
}

/** Single-line prize label (POL/BLK/boost/machine) for leaderboard and prize cards. */
export function formatTournamentPrizeLabel(prize: TournamentPrize, t: TFunction): string {
  if (prize.prizeType === 'POL') {
    return `${formatTournamentTokenAmount(prize.polAmount)} POL`;
  }
  if (prize.prizeType === 'BLK') {
    return `${formatTournamentTokenAmount(prize.blkAmount)} BLK`;
  }
  if (prize.prizeType === 'MINING_BOOST') {
    return `${formatHashrate(prize.boostHashRate ?? 0)} / ${prize.boostHours ?? 0}h`;
  }
  if (prize.prizeType === 'MACHINE') {
    const name = prize.miner?.name ?? prize.minerName ?? t('tournaments.admin.machine');
    return `${prize.minerCount ?? 1}× ${name}`;
  }
  return '';
}
