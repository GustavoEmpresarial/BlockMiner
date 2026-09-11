import { z } from "zod";
import { WITHDRAW_MIN_POL } from "../wallet.types.js";
import { EVM_ADDRESS_REGEX } from "../../../shared/security/walletAddress.js";

/** Ported from legacy wallet.schemas.ts withdrawRequestSchema. */
export const withdrawRequestSchema = z.object({
  amount: z.coerce.number().refine((n) => !Number.isNaN(n) && n >= WITHDRAW_MIN_POL, {
    message: `Minimum withdrawal is ${WITHDRAW_MIN_POL} POL.`,
  }),
  address: z
    .string()
    .min(1)
    .refine((a) => EVM_ADDRESS_REGEX.test(a), { message: "Invalid wallet address format." }),
});

/** SHIB body — minimum is price-dynamic in the service; schema only checks shape. */
export const shibWithdrawRequestSchema = z.object({
  amount: z.coerce.number().refine((n) => !Number.isNaN(n) && n > 0, {
    message: "Amount must be a positive number.",
  }),
  address: z
    .string()
    .min(1)
    .refine((a) => EVM_ADDRESS_REGEX.test(a), { message: "Invalid wallet address format." }),
});

export const completeWithdrawalSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "txHash required (0x + 64 hex characters)"),
});
