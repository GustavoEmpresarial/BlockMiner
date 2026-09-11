import { Prisma } from "@prisma/client";
import { getShibUsdPrice } from "../../../shared/cryptoPrice/cryptoPrice.js";
import { EVM_ADDRESS_REGEX } from "../../../shared/security/walletAddress.js";
import {
  SHIB_WITHDRAW_FEE,
  SHIB_WITHDRAWALS_ENABLED,
  WITHDRAW_MIN_SHIB_USD,
  WITHDRAW_PROCESSING_HOURS,
  computeMinShibFromUsd,
} from "../wallet.types.js";
import * as withdrawalRepo from "./withdrawal.repository.js";

export async function getWithdrawalFeeInfo(userId: number): Promise<{
  feePercent: number;
  feeWaived: boolean;
  completionsToday: number;
  requiredForWaiver: number;
  feeAlreadyChargedToday: boolean;
}> {
  const [completionsToday, feeAlreadyChargedToday] = await Promise.all([
    withdrawalRepo.countTodayOfferwallCompletions(userId),
    withdrawalRepo.hasFeeChargedWithdrawalToday(userId),
  ]);
  return {
    feePercent: withdrawalRepo.WITHDRAWAL_FEE_PERCENT,
    feeWaived: completionsToday >= withdrawalRepo.WITHDRAWAL_FEE_WAIVER_REQUIRED,
    completionsToday,
    requiredForWaiver: withdrawalRepo.WITHDRAWAL_FEE_WAIVER_REQUIRED,
    feeAlreadyChargedToday,
  };
}

export async function submitWithdrawalRequest(userId: number, amountPol: number, destinationAddress: string) {
  const feeInfo = await getWithdrawalFeeInfo(userId);
  // item 87: cálculo de taxa/débito financeiro rebuild em Prisma.Decimal (era `Number`
  // puro com Math.round/1e8, arredondamento binário-decimal — ex. 0.1+0.2=0.30000000000004
  // — igual ao padrão já usado em energy-tax.service.ts/checkin.service.ts). `amountPol`
  // entra em `Decimal` desde a primeira operação, não só no fim.
  const amountDecimal = new Prisma.Decimal(String(amountPol));
  const feeAmount = feeInfo.feeWaived
    ? new Prisma.Decimal(0)
    : amountDecimal.times(feeInfo.feePercent).dividedBy(100).toDecimalPlaces(8);
  return withdrawalRepo.createWithdrawal(userId, amountDecimal, destinationAddress, feeAmount);
}

export function toWithdrawalPublicDto(tx: {
  id: number;
  amount: unknown;
  fee: unknown;
  status: string;
  type: string;
  userId: number;
  createdAt: Date;
  txHash: string | null;
}) {
  return {
    id: tx.id,
    amount: Number(tx.amount),
    fee: tx.fee != null ? Number(tx.fee) : null,
    status: tx.status,
    type: tx.type,
    userId: tx.userId,
    createdAt: tx.createdAt,
    txHash: tx.txHash,
  };
}

export function isValidPolygonTxHash(h: unknown): boolean {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h.trim());
}

export async function getShibWithdrawMinInfo(): Promise<{
  minShib: number;
  minUsd: number;
  shibUsd: number;
  fee: number;
  enabled: boolean;
}> {
  const shibUsd = await getShibUsdPrice();
  const minUsd = WITHDRAW_MIN_SHIB_USD;
  const minShib = computeMinShibFromUsd(minUsd, shibUsd);
  return {
    minShib,
    minUsd,
    shibUsd,
    fee: SHIB_WITHDRAW_FEE,
    enabled: SHIB_WITHDRAWALS_ENABLED,
  };
}

export type SubmitShibWithdrawalResult =
  | { ok: true; netAmount: number; fee: number; processingHours: number }
  | { ok: false; reason: "disabled" | "invalid_address" | "below_minimum" | "invalid_amount"; minShib?: number; minUsd?: number };

/**
 * Client posts `amount` = net SHIB to receive on-chain; fee is reserved on top
 * (SPA validates `amount + fee <= balance`).
 */
export async function submitShibWithdrawal(
  userId: number,
  amountRaw: unknown,
  addressRaw: unknown,
): Promise<SubmitShibWithdrawalResult> {
  if (!SHIB_WITHDRAWALS_ENABLED) {
    return { ok: false, reason: "disabled" };
  }

  const address = typeof addressRaw === "string" ? addressRaw.trim() : "";
  if (!EVM_ADDRESS_REGEX.test(address)) {
    return { ok: false, reason: "invalid_address" };
  }

  const amount = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const minInfo = await getShibWithdrawMinInfo();
  if (minInfo.minShib > 0 && amount < minInfo.minShib) {
    return {
      ok: false,
      reason: "below_minimum",
      minShib: minInfo.minShib,
      minUsd: minInfo.minUsd,
    };
  }

  const fee = new Prisma.Decimal(String(SHIB_WITHDRAW_FEE));
  const net = new Prisma.Decimal(String(amount));
  await withdrawalRepo.createShibWithdrawal(userId, net, address, fee);
  return {
    ok: true,
    netAmount: amount,
    fee: SHIB_WITHDRAW_FEE,
    processingHours: WITHDRAW_PROCESSING_HOURS,
  };
}
