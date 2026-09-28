import type { Response } from "express";
import {
  classifyInfrastructureError,
  safeClientErrorMessage,
} from "../../shared/errors/prismaHttpErrors.js";
import type { Logger } from "../../core/logger/logger.js";

export function err(res: Response, status: number, msg: string): void {
  res.status(status).json({ ok: false, message: msg });
}

export function parsePositiveIntId(val: unknown): number | null {
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function errorMessage(e: unknown): string {
  return safeClientErrorMessage(e, "Server error");
}

export function sendServiceError(res: Response, e: unknown, log: Logger): void {
  const infra = classifyInfrastructureError(e);
  if (infra) {
    log.warn("ptc infrastructure error", { code: infra.code, error: String(e) });
    res.status(infra.status).json({
      ok: false,
      code: infra.code,
      message: infra.message,
      retryable: true,
    });
    return;
  }
  err(res, 400, errorMessage(e));
}
