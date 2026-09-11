/** Offerwall.GG S2S postback — macros from publisher integration docs. */
export type OfferwallGgPostbackInput = {
  userId: string;
  transactionId: string;
  /** Partner virtual currency amount (signed into HMAC). */
  amount: string;
  payoutUsd: string;
  offerName: string;
  offerId: string;
  /** credited | reversed */
  status: string;
  /** "1" = test — never credit */
  test: string;
  signature: string;
};
