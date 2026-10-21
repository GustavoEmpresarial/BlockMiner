-- The YOUTUBE and GENERAL tournament scorers group claims by user over the tournament window
-- (WHERE claimed_at range AND status). No index on claimed_at: each run seq-scanned the whole
-- table (~9 times a minute in prod on 2026-10-18).
CREATE INDEX CONCURRENTLY IF NOT EXISTS "youtube_watch_power_history_claimed_at_idx" ON "youtube_watch_power_history"("claimed_at");
