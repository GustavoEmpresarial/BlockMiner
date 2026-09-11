import { z } from "zod";

export const googleExchangeSchema = z
  .object({
    code: z.string().trim().min(8).max(512),
    redirectUri: z.string().trim().url().max(500).optional(),
    /** PKCE S256 verifier stored in sessionStorage on the callback origin (required). */
    codeVerifier: z.string().trim().min(43).max(128),
  })
  .strict();

export type GoogleExchangeBody = z.infer<typeof googleExchangeSchema>;
