import axios from 'axios';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarCheck,
  Gamepad2,
  Layers,
  Pickaxe,
  Target,
  Youtube
} from 'lucide-react';
import type { QuickTemplateId } from './adminDailyTasks/adminDailyTasksModel';

export function axiosErrorMessage(err: unknown): string | undefined {
  if (!axios.isAxiosError(err) || err.response?.data == null) return undefined;
  const d = err.response.data;
  if (typeof d === 'object' && d !== null && 'message' in d) {
    const m = (d as { message?: unknown }).message;
    return m != null ? String(m) : undefined;
  }
  return undefined;
}

export const QUICK_TEMPLATES: { id: QuickTemplateId; icon: LucideIcon; labelKey: string; subKey: string }[] = [
  { id: 'checkins', icon: CalendarCheck, labelKey: 'admin_daily_tasks.tpl_checkins', subKey: 'admin_daily_tasks.tpl_checkins_sub' },
  { id: 'games_any', icon: Gamepad2, labelKey: 'admin_daily_tasks.tpl_games', subKey: 'admin_daily_tasks.tpl_games_sub' },
  { id: 'games_one', icon: Target, labelKey: 'admin_daily_tasks.tpl_games_one', subKey: 'admin_daily_tasks.tpl_games_one_sub' },
  { id: 'offerwall', icon: Layers, labelKey: 'admin_daily_tasks.tpl_offerwall', subKey: 'admin_daily_tasks.tpl_offerwall_sub' },
  { id: 'mine_blk', icon: Pickaxe, labelKey: 'admin_daily_tasks.tpl_mine_blk', subKey: 'admin_daily_tasks.tpl_mine_blk_sub' },
  { id: 'youtube', icon: Youtube, labelKey: 'admin_daily_tasks.tpl_youtube', subKey: 'admin_daily_tasks.tpl_youtube_sub' }
];
