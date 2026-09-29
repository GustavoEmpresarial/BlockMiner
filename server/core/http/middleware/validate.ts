import type { Request, Response, NextFunction } from "express";
import type { ZodSchema, ZodError } from "zod";

function formatZodError(error: ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

function deriveCodeFromZodFirstMessage(message: unknown): string | undefined {
  if (typeof message !== "string") return undefined;
  const prefix = "auth.register.errors.";
  if (message.startsWith(prefix)) {
    const tail = message.slice(prefix.length).replace(/[^a-z0-9_]/gi, "_");
    return tail ? tail.toUpperCase() : undefined;
  }
  return undefined;
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const errors = formatZodError(result.error);
      const code = deriveCodeFromZodFirstMessage(errors[0]?.message) || "INVALID_BODY";
      res.status(400).json({ ok: false, message: "Invalid request data.", errors, code });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query || {});
    if (!result.success) {
      res.status(400).json({
        ok: false,
        code: "INVALID_QUERY",
        message: "Invalid query data.",
        errors: formatZodError(result.error),
      });
      return;
    }
    try {
      (req as unknown as { query: unknown }).query = result.data;
    } catch {
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params || {});
    if (!result.success) {
      res.status(400).json({
        ok: false,
        code: "INVALID_PARAMS",
        message: "Invalid route parameters.",
        errors: formatZodError(result.error),
      });
      return;
    }
    try {
      (req as unknown as { params: unknown }).params = result.data;
    } catch {
      Object.defineProperty(req, "params", {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
}
