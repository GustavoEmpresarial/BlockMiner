import { z } from "zod";
import { EVM_ADDRESS_REGEX } from "../../../shared/security/walletAddress.js";

const evmAddressSchema = z
  .string()
  .trim()
  .refine((a) => EVM_ADDRESS_REGEX.test(a), { message: "Invalid wallet address format." });

/** Body for initiating a Web3 wallet link challenge. */
export const walletLinkChallengeBodySchema = z
  .object({
    address: evmAddressSchema,
    chainId: z.coerce.number().int().positive(),
  })
  .strict();

/** Body for verifying a Web3 wallet link against the issued challenge. */
export const walletLinkVerifyBodySchema = z
  .object({
    address: evmAddressSchema,
    chainId: z.coerce.number().int().positive(),
    signature: z.string().min(1),
  })
  .strict();

/** Body for the legacy one-step wallet verification (no server-issued challenge). */
export const updateWalletAddressSchema = z
  .object({
    walletAddress: z.string().min(1),
    signature: z.string().min(1),
  })
  .strict();
