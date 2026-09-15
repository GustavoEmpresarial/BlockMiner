# tests/burn-events

| File | Kind | What it proves |
|---|---|---|
| `burn-events.limits.test.mjs` | Unit | Per-user claim default is **10**; `stockTotal` default is unlimited; DoS cap ≠ product limit of 10 machines. |
| `burn-events.config.test.mjs` | Unit | Duration env reader (15 min named default). |
| `burn-events.fee.test.mjs` | Unit | Fee rates + HTTP mapping (400 vs 409 vs 404 vs 500). |
| `burn-events.schemas.test.mjs` | API / contract | Zod `.strict()` start/claim/admin bodies; rejects mass-assignment extras. |
| `burn-events.routes-security.test.mjs` | Security | Auth on player + admin routers; start/claim keep rate-limit + idempotency. |
| `burn-events.visibility.test.mjs` | Unit | Hub visibility vs open window vs global stock. |
| `burn-events.service.test.mjs` | Unit | Fee currency, empty selection, pending session, destroy-before-session, oversized payload. |
| `burn-events.destroy.test.mjs` | Unit | Destroy wipes location rows and fail-closes on count mismatch. |
| `burn-events.claim-inbox.smoke.test.mjs` | Smoke | Real DB: start destroys machines; claim before `completesAt` is `BURN_NOT_READY`; after, reward inbox. |

Run:

```bash
./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/burn-events/
```

Smoke needs `DATABASE_URL`.
