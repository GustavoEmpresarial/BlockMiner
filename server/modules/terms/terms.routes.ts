import express, { type Request, type Response, type Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { validateBody } from "../../core/http/middleware/validate.js";
import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { getContractStatus, signContract, TermsContractError } from "./terms.contract.js";

const log = logger.child("TermsRoutes");
export const termsRouter: Router = express.Router();

const readLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
const signSchema = z.object({ version: z.string().max(20), stamped: z.array(z.string().max(20)).max(20) }).strict();

function fail(res: Response, req: Request, err: unknown, op: string) {
  if (err instanceof TermsContractError) {
    res.status(err.status).json({ ok: false, code: err.code });
    return;
  }
  log.error("TERMS_CONTRACT_FAILED", { op, userId: req.user?.id ?? null, error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ ok: false, code: "TERMS_CONTRACT_FAILED" });
}

termsRouter.get("/contract", requireAuth, readLimiter, async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    res.json({ ok: true, ...(await getContractStatus(user.id)) });
  } catch (err) {
    fail(res, req, err, "status");
  }
});

termsRouter.post("/contract/sign", requireAuth, writeLimiter, validateBody(signSchema), async (req, res) => {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const rid = req.headers["x-request-id"];
    res.json({ ok: true, ...(await signContract(user.id, { ...req.body, requestId: typeof rid === "string" ? rid : null })) });
  } catch (err) {
    fail(res, req, err, "sign");
  }
});
