# tests/checkin

All check-in tests live here (not next to source).

| Kind | Files | What |
|------|--------|------|
| Unit | `*.test.mjs` (no DB) | Pure streak/grace math, chain helpers, monitor detection |
| Smoke | `*.smoke.test.mjs` | Real DB rows + `computeStreakAfterCheckin` (needs `DATABASE_URL` via `.env`) |

Run:

```bash
./node_modules/.bin/tsx --import ./tests/_env-test-overrides.mjs --test --test-force-exit tests/checkin/
```

Or root `npm test` (all modules).
