/**
 * Prisma error classification shared by every module that talks to the DB
 * directly from a controller/service (auth, session, users, admin and
 * beyond). Ported from legacy/server/utils/prismaHttpErrors.ts.
 */
import type { Response } from "express";

export function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function prismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function isPrismaTransactionStartTimeout(error: unknown): boolean {
  return /unable to start a transaction in the given time/i.test(unknownErrorMessage(error));
}

export function isPrismaTransactionRuntimeError(error: unknown): boolean {
  const code = prismaErrorCode(error);
  if (code === "P2028" || code === "P2034") return true;
  const msg = unknownErrorMessage(error).toLowerCase();
  return (
    msg.includes("transaction api error") ||
    msg.includes("transaction already closed") ||
    msg.includes("deadlock") ||
    msg.includes("could not serialize")
  );
}

export function isPrismaConnectionError(error: unknown): boolean {
  if (isPrismaTransactionStartTimeout(error) || isPrismaTransactionRuntimeError(error)) return true;
  const code = prismaErrorCode(error);
  if (code === "P1001" || code === "P1002" || code === "P1008" || code === "P1017") return true;
  const msg = unknownErrorMessage(error).toLowerCase();
  return (
    msg.includes("timeout exceeded when trying to connect") ||
    msg.includes("connection terminated") ||
    msg.includes("too many clients") ||
    msg.includes("pool is full") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("can't reach database server")
  );
}

export function isPrismaSchemaMismatch(error: unknown): boolean {
  const code = prismaErrorCode(error);
  if (code === "P2021" || code === "P2022") return true;
  return /does not exist in the current database/i.test(unknownErrorMessage(error));
}

export type PrismaAwareErrorBody = {
  ok: false;
  code: string;
  message: string;
  error: string;
};

export function buildPrismaAwareErrorBody(error: unknown, fallbackMessage: string): PrismaAwareErrorBody {
  if (isPrismaSchemaMismatch(error)) {
    const message =
      "O banco de dados está desatualizado em relação ao aplicativo. Execute as migrations pendentes.";
    return { ok: false, code: "SCHEMA_OUT_OF_DATE", message, error: message };
  }
  if (isPrismaConnectionError(error)) {
    return { ok: false, code: "SERVICE_UNAVAILABLE", message: fallbackMessage, error: fallbackMessage };
  }
  return { ok: false, code: "INTERNAL_ERROR", message: fallbackMessage, error: fallbackMessage };
}

export function prismaAwareHttpStatus(error: unknown): number {
  if (isPrismaSchemaMismatch(error) || isPrismaConnectionError(error)) return 503;
  return 500;
}

export function respondPrismaAwareError(res: Response, error: unknown, fallbackMessage: string): void {
  const status = prismaAwareHttpStatus(error);
  res.status(status).json(buildPrismaAwareErrorBody(error, fallbackMessage));
}

// ---------------------------------------------------------------------------
// Auth/session/admin-specific classification (merged from legacy auth.prisma.ts)
// ---------------------------------------------------------------------------

export function isAuthPrismaNotFound(error: unknown): boolean {
  return prismaErrorCode(error) === "P2025";
}

export function isAuthPrismaUniqueConflict(error: unknown): boolean {
  return prismaErrorCode(error) === "P2002";
}

export function isAuthPrismaBadInput(error: unknown): boolean {
  const code = prismaErrorCode(error);
  return code === "P2000" || code === "P2006" || code === "P2011" || code === "P2012" || code === "P2019";
}

export function isAuthPrismaInfrastructureError(error: unknown): boolean {
  return (
    isPrismaConnectionError(error) || isPrismaSchemaMismatch(error) || isPrismaTransactionRuntimeError(error)
  );
}

type AuthPrismaErrorResult =
  | { handled: true; status: number; code: string; message: string }
  | { handled: false };

export function classifyAuthPrismaError(
  error: unknown,
  serviceUnavailableMessage: string,
): AuthPrismaErrorResult {
  if (isAuthPrismaInfrastructureError(error)) {
    const isSchema = isPrismaSchemaMismatch(error);
    return {
      handled: true,
      status: 503,
      code: isSchema ? "SCHEMA_OUT_OF_DATE" : "SERVICE_UNAVAILABLE",
      message: isSchema
        ? "O banco de dados está desatualizado. Execute as migrations pendentes."
        : serviceUnavailableMessage,
    };
  }
  if (isAuthPrismaNotFound(error)) {
    return {
      handled: true,
      status: 409,
      code: "RECORD_NOT_FOUND",
      message: "O recurso foi modificado por outra operação. Tente novamente.",
    };
  }
  if (isAuthPrismaUniqueConflict(error)) {
    return {
      handled: true,
      status: 409,
      code: "CONFLICT",
      message: "Uma operação conflitante foi detectada. Tente novamente.",
    };
  }
  if (isAuthPrismaBadInput(error)) {
    return {
      handled: true,
      status: 400,
      code: "INVALID_INPUT",
      message: "Dados inválidos. Verifique os campos e tente novamente.",
    };
  }
  return { handled: false };
}

export function respondAuthPrismaError(res: Response, error: unknown, fallbackMessage: string): boolean {
  const result = classifyAuthPrismaError(error, fallbackMessage);
  if (!result.handled) return false;
  res.status(result.status).json({ ok: false, code: result.code, message: result.message, error: result.message });
  return true;
}
