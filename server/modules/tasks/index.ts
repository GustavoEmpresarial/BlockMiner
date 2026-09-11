/**
 * Public boundary of the tasks (daily missions) module — ported from
 * legacy/server/modules/tasks/ + legacy/server/services/dailyTasks/ (Fase 10d, gap discovered
 * post Fase-8; see current/docs/PROGRESSO.txt entry 10d for full context).
 *
 * The four `notifyDailyTask*` hooks below are the ONLY way other modules should report
 * progress — never import tasks.service.js / tasks.repository.js directly.
 */
export { tasksRouter } from "./tasks.routes.js";
export { tasksRouter as dailyTasksRouter } from "./tasks.routes.js";
export { tasksAdminRouter } from "./tasks.admin.routes.js";

export {
  getDailyTasksDashboard,
  claimDailyTaskReward,
  bumpDailyTasksForUser,
  notifyDailyTaskLoginDay,
  notifyDailyTaskBlkMined,
  notifyDailyTaskGamePlayed,
  notifyDailyTaskYoutubeWatch,
  notifyDailyTaskInternalOfferwallCompleted,
} from "./tasks.service.js";

export {
  TASK_LOGIN_DAY,
  TASK_MINE_BLK,
  TASK_PLAY_GAMES,
  TASK_WATCH_YOUTUBE,
  TASK_INTERNAL_OFFERWALL,
} from "./tasks.constants.js";

export {
  getDailyTaskPeriodKey,
  getNextDailyTaskResetAt,
  normalizeDailyTaskResetCadence,
  DAILY_TASK_RESET_DAILY,
  DAILY_TASK_RESET_WEEKLY,
  DAILY_TASK_RESET_MONTHLY,
} from "./tasks.period.js";

export type { DailyTaskDashboard, ClaimDailyTaskResult } from "./tasks.types.js";
