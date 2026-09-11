/**
 * Multiwall Ads PTC module S2S postback
 * (Instruction: hashuser, amount, amountus, transaction, user_id).
 */
export type MultiwallPostbackInput = {
  hashuser: string;
  amount: string;
  amountus: string;
  transaction: string;
  userId: string;
};
