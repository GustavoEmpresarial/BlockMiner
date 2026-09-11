// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { z } from "zod";
import { EVM_ADDRESS_REGEX } from "../../../shared/security/walletAddress.js";
/** Ported from legacy wallet.schemas.ts postDepositEstimateGasSchema. */
export const postDepositEstimateGasSchema = z.object({
    from: z.string().refine((s) => EVM_ADDRESS_REGEX.test(s)),
    to: z.string().refine((s) => EVM_ADDRESS_REGEX.test(s)),
    valueHex: z.string().regex(/^0x[0-9a-fA-F]+$/),
    data: z.string().optional(),
});
export const submitDepositSchema = z.object({
    txHash: z.string().min(1),
    claimedAmount: z.union([z.string(), z.number()]).optional(),
});
