import * as transactionRepo from "./transaction.repository.js";

export async function getTransactionsForUser(userId: number) {
  const rows = await transactionRepo.listTransactionsForUser(userId);
  return rows.map((tx) => ({ ...tx, amount: Number(tx.amount), fee: tx.fee != null ? Number(tx.fee) : null }));
}
