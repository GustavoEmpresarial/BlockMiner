-- The Postgres sliding-window rate limiter (SEC_SW_RL), idempotency keys (SEC_IDEM) and login
-- lockout (SEC_LOCK) all look rows up by (callback_type, callback_hash) inside a transaction
-- holding an advisory lock. Only (status) was indexed, so every limited request seq-scanned.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "callback_queue_callback_type_callback_hash_idx" ON "callback_queue"("callback_type", "callback_hash");
