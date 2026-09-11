import { z } from "zod";

export const satspayExchangeSchema = z
  .object({
    code: z.string().trim().min(8).max(512),
    redirectUri: z.string().trim().url().max(500).optional(),
    /** PKCE S256 verifier from SatsPay SDK sessionStorage (required). */
    codeVerifier: z.string().trim().min(43).max(128),
  })
  .strict();

export type SatspayExchangeBody = z.infer<typeof satspayExchangeSchema>;
