-- GET /youtube/stats runs every 10 s per watching user and asks for today's claims
-- (WHERE user_id AND created_at range). With only (user_id) it read every claim the user
-- ever made (~40k rows for the heaviest accounts) and filtered by date.
-- CONCURRENTLY so the live table keeps taking claims; it must be the only statement in the file.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "youtube_watch_power_history_user_id_created_at_idx" ON "youtube_watch_power_history"("user_id", "created_at");
