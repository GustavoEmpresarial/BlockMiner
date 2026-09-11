/** Ported from legacy/server/modules/offerwallme/offerwallme.controller.ts. */
export type OfferwallMePostbackInput = {
  subId: string;
  transId: string;
  reward: string;
  payout: string;
  offerName: string;
  offerType: string;
  status: number;
  debug: string;
  signature: string;
};

export type OfferwallMeCreditParams = {
  userId: number;
  transId: string;
  offerName: string | null;
  offerType: string | null;
  payoutUsd: number;
  polPrice: number;
  status: number;
  clientIp: string;
};
