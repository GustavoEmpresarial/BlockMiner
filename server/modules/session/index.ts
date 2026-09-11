// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Public surface of the session module — the single owner of session logic
 * (heartbeat presence + refresh-token rotation + GET /auth/session +
 * logout). `auth` mounts these controllers under /auth/* and only ever
 * imports from here (see plan decision: legacy auth/session/ merged into
 * this module).
 */
export { sessionRouter } from "./session.routes.js";
export { processHeartbeat, attachSlidingAccessCookie } from "./session.controller.js";
export { getSession, logoutPost, markAdblockPost } from "./session.auth.controller.js";
export { refreshPost, maybeRenewAccessCookie } from "./session.refresh.controller.js";
export { createRefreshTokenRecord, getRefreshTokenById, revokeRefreshToken, revokeRefreshTokensForUser, } from "./session.tokens.js";
