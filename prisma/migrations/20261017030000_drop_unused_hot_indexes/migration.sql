-- Indexes on the tables that receive ~2,000 rows per mining block, with no reads to pay for them.
-- pg_stat_user_indexes on production, 2026-10-02 → 2026-10-17 (stats reset 10-02):
--   mining_rewards_log_user_reward_covering_idx  0 scans, 1.2 GB  (created by hand, never in the schema)
--   mining_rewards_log_user_id_idx               0 scans, 283 MB  (covered by (user_id, created_at))
--   block_miner_rewards_user_id_idx             36 scans, 293 MB  (covered by (user_id, created_at))
--   event_outbox_topic_created_at_idx            0 scans, 590 MB
-- Every insert paid for all of them (index writes + WAL). Lookups by user_id keep using the
-- (user_id, created_at) indexes, which lead with user_id.
DROP INDEX IF EXISTS "mining_rewards_log_user_reward_covering_idx";
DROP INDEX IF EXISTS "mining_rewards_log_user_id_idx";
DROP INDEX IF EXISTS "block_miner_rewards_user_id_idx";
DROP INDEX IF EXISTS "event_outbox_topic_created_at_idx";
