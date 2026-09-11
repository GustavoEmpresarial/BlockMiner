// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import express from "express";
import { requireAuth } from "../../../core/http/middleware/auth.js";
import { createDistributedRateLimiter } from "../../../core/http/middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../../../core/http/middleware/idempotency.js";
import { validateBody } from "../../../core/http/middleware/validate.js";
import { getVault, moveToVault, retrieveFromVault } from "./vault.controller.js";
import { moveToVaultBodySchema, retrieveFromVaultBodySchema } from "./vault.schemas.js";
export const vaultRouter = express.Router();
vaultRouter.use(requireAuth);
const vaultWriteLimiter = createDistributedRateLimiter({
    windowMs: 60_000,
    max: 40,
    name: "vault_write",
    keyGenerator: (req) => `ip:${req.ip}`,
    secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});
vaultRouter.get("/", getVault);
vaultRouter.post("/move-to-vault", vaultWriteLimiter, validateBody(moveToVaultBodySchema), requireCriticalIdempotency({ scope: "vault_move" }), moveToVault);
vaultRouter.post("/retrieve-from-vault", vaultWriteLimiter, validateBody(retrieveFromVaultBodySchema), requireCriticalIdempotency({ scope: "vault_retrieve" }), retrieveFromVault);
