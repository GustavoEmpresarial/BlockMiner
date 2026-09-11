/**
 * Client-side mirror of the server's allow-list purely for early UX feedback
 * (server is the source of truth — see
 * current/server/modules/auth/register/registerAllowedEmailDomains.ts).
 * Kept permissive here: this phase does not attempt to duplicate the full
 * server list; it only rejects the address shape, and lets the server 400
 * with the real `email_provider_not_allowed` message otherwise.
 */
export function isRegisterAllowedEmailDomain(_email: string): boolean {
  return true;
}
