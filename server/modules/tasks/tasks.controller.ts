import type { Request, Response } from "express";
import { reportError } from "../../core/errors/index.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { classifyInfrastructureError } from "../../shared/errors/prismaHttpErrors.js";
import { TASKS_ERROR } from "./tasks.errors.js";
import { getDailyTasksDashboard, claimDailyTaskReward } from "./tasks.service.js";

function userIdOf(req: Request): number | undefined {
  const id = req.user?.id;
  return typeof id === "number" ? id : undefined;
}

function failed(
  res: Response,
  req: Request,
  code: string,
  operation: string,
  error: unknown,
  context: Record<string, unknown>,
): void {
  const infra = classifyInfrastructureError(error);
  const report = reportError({
    code,
    category: infra ? "DATABASE" : "UNKNOWN",
    severity: "ERROR",
    impact: "MEDIUM",
    module: "tasks",
    operation,
    error,
    context,
    req,
  });
  res.status(500).json({ ok: false, code: "error", errorId: report.errorId });
}

type TaskParams = { taskId: string };

export async function getDailyTasks(req: Request, res: Response): Promise<void> {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const data = await getDailyTasksDashboard(user.id);
    res.json({ ok: true, ...data });
  } catch (e: unknown) {
    failed(res, req, TASKS_ERROR.LIST_FAILED, "getDailyTasks", e, { userId: userIdOf(req) });
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
    failed(res, req, TASKS_ERROR.CLAIM_FAILED, "postClaimDailyTask", e, { userId: userIdOf(req) });
  }
}
