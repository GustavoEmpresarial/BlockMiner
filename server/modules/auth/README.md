# auth

Identity module: player login/register/session/password-reset + admin login
(`auth.admin.*`, merged from legacy `admin-auth` per the Fase 1 plan — admin
login is just another authentication flow, not a separate module).

Consumes `session/index.ts` for refresh-token issuance/rotation and
`admin/index.ts` for admin identity services. Never imported by other
modules except through `auth/index.ts`.

## Endpoints

All responses follow `{ ok: true, ...data }` / `{ ok: false, message, code }`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | rate-limited, Turnstile-gated | Creates the user + refCode + referral link, and provisions the welcome-miner/starter-rack inventory (8x welcome miner + room 1 rack grid) atomically in the same transaction — see `register.controller.ts` doc-comment. |
| POST | `/api/auth/login` | rate-limited, Turnstile-gated | Email-only identifier. Timing-safe dummy compare on miss. Optional email-2FA gate (`AUTH_EMAIL_2FA_ENABLED`). Issues access+refresh cookies + reuses the CSRF cookie already set by the CSRF middleware. |
| GET | `/api/auth/satspay/config` | public | Public SatsPay client id + redirect URI (no secret). `enabled=false` until `SATSPAY_CLIENT_ID` + `SATSPAY_CLIENT_SECRET` are set. |
| POST | `/api/auth/satspay` | rate-limited | Exchange OAuth `code` → SatsPay token/userinfo → link/create BlockMiner user → session cookies. |
| GET | `/api/auth/satspay/callback` | rate-limited | Browser/popup return URL registered in the SatsPay OAuth app. |
| GET | `/api/auth/session` | access cookie | Returns the current user + `hasReferral`. `energyHasPendingTax` is hardcoded `false` (energy-tax module not yet built). |
| POST | `/api/auth/refresh` | refresh cookie | Rotates refresh token (single-use, replaced-by chain) + reissues access token. Delegates to `session/index.ts`. |
| POST | `/api/auth/logout` | — | Clears both cookies. |
| POST | `/api/auth/mark-adblock` | access cookie | |
| POST | `/api/auth/change-password` | access cookie | |
| POST | `/api/auth/forgot-password` | rate-limited | No-ops silently (still `200 { ok:true }`) unless SMTP is configured — see `shared/security/mailer.ts`. |
| POST | `/api/auth/legacy-password-reset` | rate-limited | Consumes a `pwd_reset` JWT. |
| POST | `/api/auth/reset-password-manual` | rate-limited, gated by `ADMIN_KEYED_PASSWORD_RESET_ENABLED` | |
| POST | `/api/auth/admin/force-password-reset` | same gate | |
| POST | `/api/admin/auth/login` | rate-limited | DB-backed `AdminUser` when any exist; else legacy `ADMIN_EMAIL`/`ADMIN_SECURITY_CODE` env fallback. |
| GET | `/api/admin/auth/check` | admin session cookie | |
| POST | `/api/admin/auth/logout` | — | |

## Security invariants preserved

- Passwords: bcrypt, 10 rounds (`shared/security/password.ts`); admin passwords: bcrypt, 12 rounds (`modules/admin/admin.service.ts`).
- Access JWT: HS256, `JWT_SECRET`, 12h default, `iss`/`aud` checked (`shared/security/authTokens.ts`).
- Refresh tokens: opaque `{uuid}.{96 hex}`, only the SHA-256 hash is persisted, single-use with a `replacedBy` chain, 30-day default TTL.
- CSRF: double-submit cookie (`blockminer_csrf` + `X-CSRF-Token` header) on every mutating request except a documented exempt-prefix list.
- Timing-attack mitigation: `compareDummyPassword` runs a real bcrypt compare against a fixed dummy hash whenever the identifier lookup fails, so "user not found" and "wrong password" take the same wall-clock time.
- `.strict()` Zod schemas reject unknown body fields on every auth endpoint.

## Known deviations from legacy (Fase 1 scope)

These are deliberate scope cuts documented at the point of deviation in code
comments; revisit once the named module exists:

- **No IP-intelligence / account-lockout / device-fingerprint risk scoring** on login or register (legacy `services/{accountLockoutService,authNetworkSignalService,ipIntelligenceService}.ts`). `modules/antibot` and `modules/ip-intelligence` now exist and are fully ported, but the registration-cooldown scoring glue (`evaluateRegistrationAttempt`) that stitched them into `register.controller.ts` was never ported — wiring it in is a separate follow-up.
- **No async audit-event bus** (legacy `src/audit/service.ts`) — replaced with structured `logger.security(...)` calls. Admin actions still get durable `AdminAuditLog` rows via `modules/admin`.
- **Email 2FA has no real mailer** — `shared/security/mailer.ts` gates every send behind `isSmtpConfigured()` (env `SMTP_HOST`/`SMTP_FROM`), matching legacy's own fallback behavior when SMTP is absent. The challenge/verify contract (`login/login.twoFactorChallenge.ts`) is self-contained in-memory.
- **Turnstile verification is a pass-through** unless `TURNSTILE_SECRET_KEY` is set, and even then only checks the token is present (no `siteverify` HTTP call yet) — see `shared/security/turnstile.ts`.
- **`createDistributedRateLimiter` is single-instance** (no Redis) — see `core/http/middleware/rateLimit.ts`.
- ~~Register does not provision starter inventory~~ — fixed: register now grants 8x welcome miner inventory rows and creates room 1's `UserRack` grid via `inventory/index.ts#grantPurchasedInventoryItems` and `rooms/index.ts#provisionFirstRoomTx`, both inside the user-creation transaction.
