// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { logger } from "../../core/logger/index.js";
const base = logger.child("Security");
export function logSecurityEvent(eventType, fields = {}, req) {
    base.security(eventType, { eventType, ...fields }, req);
}
export function logSecurityWarn(eventType, fields = {}, req) {
    base.warn(eventType, { eventType, ...fields }, req);
}
