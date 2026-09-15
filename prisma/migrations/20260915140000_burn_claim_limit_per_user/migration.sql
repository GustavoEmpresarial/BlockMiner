-- Burn events: claim_limit_per_user is how many burns EACH player may complete.
-- stock_total is the GLOBAL reward pool (NULL = unlimited). These two were swapped
-- on the live event (stock=10, per-user=1) while the product rule is 10 queimas/user.
--
-- Also: at most one pending burn_sessions row per (user, event).

CREATE TABLE IF NOT EXISTS burn_sessions (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  owned_machine_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  completes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE burn_events ALTER COLUMN claim_limit_per_user SET DEFAULT 10;

UPDATE burn_events
SET claim_limit_per_user = 10,
    stock_total = NULL
WHERE deleted_at IS NULL
  AND is_active = true
  AND claim_limit_per_user = 1
  AND stock_total = 10;

CREATE UNIQUE INDEX IF NOT EXISTS burn_sessions_one_pending_per_user_event
  ON burn_sessions (user_id, event_id)
  WHERE status = 'pending';
