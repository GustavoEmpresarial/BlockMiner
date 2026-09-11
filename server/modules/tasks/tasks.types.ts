export type BumpDailyTasksOpts = {
  dedupeKey: string;
  delta: number;
  gameSlug?: string | null;
  internalOfferwallOfferId?: number | null;
};

export type DailyTaskDashboardTask = {
  id: number;
  slug: string;
  taskType: string;
  resetCadence: string;
  translationKey: string;
  periodKey: string;
  nextResetAt: string;
  targetValue: number;
  currentValue: number;
  status: string;
  reward: Record<string, unknown>;
  gameSlug: string | null;
};

export type DailyTaskDashboard = {
  periodKey: string;
  serverTime: string;
  nextResetAt: string;
  tasks: DailyTaskDashboardTask[];
};

export type ClaimDailyTaskResult =
  | { ok: true; summary: { kind: string } }
  | { ok: false; code: string; status: number };
