# tests/

Root home for **all** automated tests (not next to feature source). Mirror the product module name under `tests/<area>/`.

## Taxonomy (AI must follow)

| Kind | Naming | What it proves |
|------|--------|----------------|
| **Unit** | `*.test.mjs` | Pure logic / DTO / config readers. No inventing fixed ms/fees — assert named defaults + env readers. |
| **Integration** | `*.integration.test.mjs` | Real DB/Redis/services when env allows; still focused on one subsystem. |
| **Smoke** | `*.smoke.test.mjs` | **Real process**: create → confirm → delete (or claim → score → collect), not only “function returns X”. Prefer smoke when touching money, inventory, tournaments, check-in, machines. |

Frontend-only suites may also live under `client/tests/` when they are SPA-only; backend/API/process tests stay here.

## Run

```bash
# all
npm test

# one folder
./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/core/

# one file
./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/checkin/checkin.streak.grace.smoke.test.mjs
```

`tests/_env-test-overrides.mjs` loads `.env` + test-safe overrides. Smoke/integration need a real `DATABASE_URL` (and Redis when the flow uses it).

## Logging coverage (core)

| Concern | Source | Tests |
|---------|--------|-------|
| Structured JSON levels / SECURITY≡ERROR | `server/core/logger/` | `tests/core/logger.levels.test.mjs` |
| HTTP access + slow threshold via `HTTP_SLOW_REQUEST_MS` | `server/core/http/middleware/httpRequestLogger.ts` | `tests/core/httpRequestLogger.test.mjs` |
| User activity action names + audit gates | `userActivityAudit.policy.ts` | `tests/core/userActivityAudit.test.mjs` |
| HTTP stack CSP / request-id | `setupHttpStack.ts` | `tests/http/setupHttpStack.test.mjs` |
| Site maintenance gate / bypass hosts / 503 HTML\|JSON | `siteMaintenance.ts` | `tests/core/siteMaintenance.test.mjs` |
| Client-error drop (captcha, CF, stalls, maintenance) | `traffic.errors.ts` | `tests/traffic/traffic.client-error-drop.test.mjs` |
| Client-error body parse (`runtime`→`crash`) | `traffic.schemas.ts` | `tests/traffic/traffic.client-error-parse.test.mjs` |
| SPA collector client-side drop (v4) | `client-error-collector-v4.js` | `tests/traffic/client-error-collector-drop.test.mjs` |
| Client telemetry drop (TS mirror) | `clientErrorTelemetry.ts` | `tests/core/clientErrorTelemetry.test.mjs` |
| Axios failure context extraction | `extractApiFailureContext.ts` | `tests/core/extractApiFailureContext.test.mjs` |

Stdout is silenced when `NODE_ENV=test` (logger). Durable trails use Postgres (`audit_logs`, etc.) — smoke that path only with DB.

## Quality bar reminder

- No magic numbers: named constants + env readers (`HTTP_SLOW_REQUEST_MS`, calendar helpers, chain config).
- After changes: `npm run typecheck`; eslint when configured; run the touched `tests/<area>/` including smoke.
- Module READMEs (e.g. `tests/checkin/README.md`) document area-specific smoke needs.
