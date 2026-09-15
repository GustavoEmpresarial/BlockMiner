# burn-events

Player burn hub (`/api/burn-events`) and admin CRUD (`/api/admin/burn-events`).

## Limits (do not swap these)

| Field | Meaning | Product default |
|---|---|---|
| `claimLimitPerUser` | How many times **each player** may complete this event | **10** (`DEFAULT_BURN_CLAIM_LIMIT_PER_USER`) |
| `stockTotal` | Global reward pool for **all players combined** | **`null` = unlimited** |
| Selected machines in one start | Driven by `requiredHashRate`, not a count of 10 | Input-size cap `MAX_BURN_OWNED_MACHINE_IDS` (DoS only) |

The live NeonForge event was misconfigured as `stockTotal=10` + `claimLimitPerUser=1`. Migration `20260915140000_burn_claim_limit_per_user` corrects that row and the schema default.

## Endpoints

All responses follow `{ ok: true, ... }` / `{ ok: false, code, message }`. Unexpected 500s use `reportError` (fingerprint, redaction) and **do not** leak stack traces.

### Player (`requireAuth`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/burn-events` | Visible hub events + `userClaimsCount` / `userCanClaim` / pending session. Rate-limited. |
| GET | `/api/burn-events/my-machines` | Caller's INVENTORY + WAREHOUSE machines only (no RACK, no IDOR id param). |
| GET | `/api/burn-events/:id/session` | Pending session for **this user + event** (404-shaped null if none). |
| POST | `/api/burn-events/:id/start` | Zod `.strict()` body `{ minerIds, feeCurrency }` + rate limit + idempotency. Destroys machines + charges fee. |
| POST | `/api/burn-events/:id/claim` | Zod `.strict()` `{ sessionId }` + rate limit + idempotency. Deliver reward inbox after `completesAt`. |

### Admin (`requireAdminAuth`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/burn-events` | List |
| POST | `/api/admin/burn-events` | Create. Omitting `claimLimitPerUser` → 10; omitting `stockTotal` → unlimited. |
| PUT | `/api/admin/burn-events/:id` | Patch including limits |
| DELETE | `/api/admin/burn-events/:id` | Soft-delete |
| GET | `/api/admin/burn-events/:id/claims` | Paginated claims |

## Security

- **AuthZ / IDOR**: every lookup is `{ userId, eventId, sessionId }` scoped to `req.user.id`. Admin router is `requireAdminAuth` (BFLA).
- **Mass assignment**: start/claim/admin bodies are Zod `.strict()`.
- **Concurrency**: `pg_advisory_xact_lock(userId, eventId)` + unique partial index `burn_sessions_one_pending_per_user_event`.
- **Replay / idempotency**: `requireCriticalIdempotency` on start/claim; client axios interceptor stamps `Idempotency-Key` for `/burn-events/`.
- **Rate limit**: distributed sliding window (IP + uid on writes).
- **Destroy integrity**: owned-machine delete count must match; mismatch rolls the transaction (`BURN_DESTROY_INCOMPLETE`).
- **Input size**: `minerIds` capped by `MAX_BURN_OWNED_MACHINE_IDS` (not a product “10 machines” rule).
- **Secrets**: `reportError` redacts tokens/passwords; 500 bodies are public codes only.

## Tests

See `tests/burn-events/README.md`.
