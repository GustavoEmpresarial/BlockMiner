-- Event outbox + stats materialization tables (Kafka earnings bus).

CREATE TABLE IF NOT EXISTS "event_outbox" (
  "id" BIGSERIAL PRIMARY KEY,
  "event_id" VARCHAR(64) NOT NULL,
  "topic" VARCHAR(128) NOT NULL,
  "payload_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_outbox_event_id_key" ON "event_outbox"("event_id");
CREATE INDEX IF NOT EXISTS "event_outbox_published_at_id_idx" ON "event_outbox"("published_at", "id");
CREATE INDEX IF NOT EXISTS "event_outbox_topic_created_at_idx" ON "event_outbox"("topic", "created_at");

CREATE TABLE IF NOT EXISTS "stats_event_dedupe" (
  "event_id" VARCHAR(64) PRIMARY KEY,
  "consumed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "user_stats_earnings_daily" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "day_utc" DATE NOT NULL,
  "source" VARCHAR(64) NOT NULL,
  "amount_pol" DECIMAL(24, 12) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_stats_earnings_daily_user_id_day_utc_source_key"
  ON "user_stats_earnings_daily"("user_id", "day_utc", "source");
CREATE INDEX IF NOT EXISTS "user_stats_earnings_daily_user_id_day_utc_idx"
  ON "user_stats_earnings_daily"("user_id", "day_utc");

CREATE TABLE IF NOT EXISTS "user_stats_earnings_total" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "source" VARCHAR(64) NOT NULL,
  "amount_pol" DECIMAL(24, 12) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_stats_earnings_total_user_id_source_key"
  ON "user_stats_earnings_total"("user_id", "source");
CREATE INDEX IF NOT EXISTS "user_stats_earnings_total_user_id_idx"
  ON "user_stats_earnings_total"("user_id");
