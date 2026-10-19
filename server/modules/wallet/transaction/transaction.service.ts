import * as transactionRepo from "./transaction.repository.js";

export async function getTransactionsForUser(userId: number) {
  const rows = await transactionRepo.listTransactionsForUser(userId);
  return rows.map((tx) => {
    let fromAsset: string | null = null;
    let toAsset: string | null = null;
    let outputAmount: number | null = null;

    if (tx.type === "swap") {
      toAsset = "BLK";
      try {
        if (tx.rawTx) {
          const parsed = JSON.parse(tx.rawTx);
          if (parsed && typeof parsed === "object") {
            if (typeof parsed.fromAsset === "string") fromAsset = parsed.fromAsset.toUpperCase();
            if (Number.isFinite(Number(parsed.output))) outputAmount = Number(parsed.output);
          }
        }
      } catch {
        /* ignore invalid json */
      }
      if (!fromAsset) {
        const rate = Number(tx.usdRateAtConfirmation || 0);
        fromAsset = rate > 0 && rate < 0.001 ? "SHIB" : "POL";
      }
      if (outputAmount == null && tx.usdValueAtConfirmation != null) {
        outputAmount = Number(tx.usdValueAtConfirmation);
      }
    } else if (tx.type === "merge_fee" || tx.type === "avatar_license") {
      try {
        const parsed = tx.rawTx ? JSON.parse(tx.rawTx) : null;
        if (parsed && typeof parsed.asset === "string") fromAsset = parsed.asset.toUpperCase();
      } catch {
        /* ignore invalid json */
      }
      if (!fromAsset) fromAsset = "BLK";
    }

    return {
      ...tx,
      amount: Number(tx.amount),
      fee: tx.fee != null ? Number(tx.fee) : null,
      fromAsset,
      toAsset,
      outputAmount,
    };
  });
}
