import type { DailyTaskReward, DailyTaskRow, DailyTasksTranslate } from './dailyTasksTypes';
import { formatUtcDateTime } from '../../../shared/utils/utcTime';

export function formatRewardSummary(t: DailyTasksTranslate, reward: DailyTaskReward | null | undefined): string {
  if (!reward) return '';
  const k = String(reward.kind || '').toUpperCase();
  if (k === 'BLK' && reward.amount != null) {
    return t('dailyTasks.reward.blk', { amount: reward.amount });
  }
  if (k === 'POL' && reward.amount != null) {
    return t('dailyTasks.reward.pol', { amount: reward.amount });
  }
  if (k === 'HASHRATE_TEMP') {
    const days = Number(reward.days ?? 1);
    const count = Number.isFinite(days) && days > 0 ? days : 1;
    return t('dailyTasks.reward.hashrate', {
      hashRate: reward.hashRate ?? 0,
      days: count,
      count,
    });
  }
  return k;
}

export function statusLabel(t: DailyTasksTranslate, status: string): string {
  const map: Record<string, string> = {
    available: 'dailyTasks.status.available',
    in_progress: 'dailyTasks.status.in_progress',
    completed: 'dailyTasks.status.completed',
    claimed: 'dailyTasks.status.claimed'
  };
  return t(map[status] || 'dailyTasks.status.available');
}

const PLURAL_TASK_KEYS = new Set([
  'dailyTasks.tasks.play_games',
  'dailyTasks.tasks.watch_youtube',
  'dailyTasks.tasks.internal_offerwall',
  'dailyTasks.tasks.checkin',
  'dailyTasks.tasks.faucet',
  'dailyTasks.tasks.shortlinks',
  'dailyTasks.tasks.offers',
  'dailyTasks.tasks.auto_mining',
  'dailyTasks.tasks.merge',
  'dailyTasks.tasks.burn',
  'dailyTasks.tasks.referrals',
]);

export function taskDescription(t: DailyTasksTranslate, task: DailyTaskRow): string {
  const key = task.translationKey || '';
  const target = task.targetValue;
  const count = typeof target === 'number' ? target : Number(String(target ?? '').trim());
  if (PLURAL_TASK_KEYS.has(key) && Number.isFinite(count)) {
    return t(key, { count, target: count });
  }
  return t(key, { target });
}

export function formatIsoLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  return formatUtcDateTime(iso, { fallback: String(iso) });
}

export function cadenceLabel(t: DailyTasksTranslate, cadence: string | null | undefined): string {
  const c = String(cadence || 'DAILY').toUpperCase();
  const key = `dailyTasks.cadence.${c}`;
  return t(key, { defaultValue: c });
}

export function formatDashboardNextResetLabel(nextResetAt: string | null | undefined): string {
  if (!nextResetAt) return '';
  return formatUtcDateTime(nextResetAt, { fallback: String(nextResetAt) });
}
