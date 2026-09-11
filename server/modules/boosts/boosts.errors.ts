/** Domain-specific errors for boosts. This module signals failures via the
 * `ActivateResult` discriminated union (see boosts.types.ts) rather than thrown
 * errors — matches legacy activateBoost's return-based error handling. No
 * separate error classes are needed today; kept as a placeholder file per the
 * module anatomy doctrine (server/modules/<domain>/<domain>.errors.ts) so a
 * future thrown-error case has an obvious home. */
export {};
