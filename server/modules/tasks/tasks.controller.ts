import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { getDailyTasksDashboard, claimDailyTaskReward } from "./tasks.service.js";

const log = logger.child("tasks.controller");

type TaskParams = { taskId: string };

export async function getDailyTasks(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const data = await getDailyTasksDashboard(user.id);
    res.json({ ok: true, ...data });
  } catch (e: unknown) {
    log.error("getDailyTasks", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postClaimDailyTask(req: Request<TaskParams>, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const taskDefinitionId = parseInt(req.params.taskId, 10);
    if (!taskDefinitionId) {
      res.status(400).json({ ok: false, code: "invalid_task" });
      return;
    }

    const r = await claimDailyTaskReward(user.id, taskDefinitionId);
    if (!r.ok) {
      res.status(r.status || 500).json({ ok: false, code: r.code });
      return;
    }
    res.json({ ok: true, summary: r.summary });
  } catch (e: unknown) {
    log.error("postClaimDailyTask", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}
