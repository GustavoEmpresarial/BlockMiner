import type { Request, Response } from "express";
import { requireSessionUser } from "../../../shared/errors/httpStatusError.js";
import * as transactionService from "./transaction.service.js";

/** GET /api/wallet/transactions */
export async function getTransactions(req: Request, res: Response): Promise<void> {
  const user = requireSessionUser(req, res);
  if (!user) return;
  try {
    const transactions = await transactionService.getTransactionsForUser(user.id);
    res.json({ ok: true, transactions });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to get transactions." });
  }
}
