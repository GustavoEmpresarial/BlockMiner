-- One open DAILY/WEEKLY/MONTHLY window per metric. Two lifecycle processes
-- finalizing the same cycle must not insert two ACTIVE rows for the next day.
CREATE UNIQUE INDEX IF NOT EXISTS "tournaments_one_open_window"
ON "tournaments" ("metric", "type", "starts_at")
WHERE "status" IN ('ACTIVE', 'SCHEDULED')
  AND "type" IN ('DAILY', 'WEEKLY', 'MONTHLY');
