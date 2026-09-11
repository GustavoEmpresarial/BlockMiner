import { api } from '../../../shared/auth/auth.store';
import type { DailyTasksDashboardData } from './dailyTasksTypes';

export function getDailyTasksDashboard() {
  return api.get<DailyTasksDashboardData>('/daily-tasks');
}

export function postDailyTaskClaim(taskId: number) {
  return api.post<{ ok: boolean }>(`/daily-tasks/${taskId}/claim`);
}
