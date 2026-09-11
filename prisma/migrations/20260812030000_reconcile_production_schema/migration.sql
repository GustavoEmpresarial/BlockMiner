-- Reconciliation migration: closes the real gap between production's actual live schema
-- (schema-only pg_dump taken 12/08/2026, before the cutover — see PROGRESSO.txt item 61) and
-- current/prisma/schema.prisma, via `prisma migrate diff`, hand-reviewed and curated before
-- being turned into this migration. NOT a blind apply of the raw diff — three categories of
-- statements were deliberately removed (left as comments below, never executed):
--
-- 1. DROP TABLE "_bkp_um_recover_20260520" / "_bkp_uom_recover_20260520" — real manual backup
--    tables that exist in production from a past incident (20/05/2026). schema.prisma never
--    modeled them (they're not part of the app's data model), but that's not a reason to
--    destroy real recovery data. Left in place, untouched, un-managed by Prisma.
-- 2. DROP TABLE "stream_destinations" — leftover from the RTMP/streaming feature explicitly
--    removed 21/06/2026 (legacy/CLAUDE.md: "No RTMP/Streaming ... nunca reintroduzir"). Very
--    likely safe to drop for real, but not verified empty before this migration was written —
--    left in place rather than guessed at under time pressure. Safe to drop later once someone
--    confirms it's actually empty.
-- 3. DROP INDEX on 8 real, meaningful production indexes (e.g.
--    mining_rewards_log_user_reward_covering_idx — a covering index on a 21M+ row table)
--    that schema.prisma simply never modeled with @@index. Dropping them would have been a
--    real performance regression, not a schema fix. Left in place; a follow-up should add
--    matching @@index declarations to schema.prisma so future `migrate diff` runs stop
--    proposing to drop them.
--
-- (ptp_earnings.amount_usd's "SET DATA TYPE DECIMAL(20,2)" in the raw diff was verified to be
-- a false positive — production's real column is already numeric(20,2), identical to
-- schema.prisma — so it was left in as a harmless no-op rather than specifically stripped.)
--
-- IDEMPOTENCY NOTE: this folder is applied via `prisma migrate deploy` both against real
-- production (which already has legacy's ~130-migration history "baked in", none of it
-- tracked by this repo's _prisma_migrations) AND against a completely fresh/empty database
-- (local dev, tests, a future clean install) that only ever ran this repo's own prior 3
-- migrations. Those two starting states differ (production already has the FKs/index-names
-- below from legacy; a fresh DB never did), so every statement here is written to be a safe
-- no-op on whichever side doesn't apply — verified by running this migration against both a
-- restored production-schema copy AND a from-scratch database (see PROGRESSO.txt item 61).

-- DropForeignKey (IF EXISTS: absent on a fresh DB, present on real production)
ALTER TABLE "moneyrain_callbacks" DROP CONSTRAINT IF EXISTS "moneyrain_callbacks_user_id_fkey";
ALTER TABLE "offerwallme_callbacks" DROP CONSTRAINT IF EXISTS "offerwallme_callbacks_user_id_fkey";
ALTER TABLE "ptp_ads" DROP CONSTRAINT IF EXISTS "ptp_ads_tier_id_fkey";
ALTER TABLE "shortlink_powers" DROP CONSTRAINT IF EXISTS "shortlink_powers_user_id_fkey";
-- Not re-added below on purpose: schema.prisma models blockedByMinerId as a plain scalar
-- column, not a Prisma relation, so no FK constraint should exist afterward either side.
ALTER TABLE "user_racks" DROP CONSTRAINT IF EXISTS "user_racks_blocked_by_miner_id_fkey";

-- SKIPPED (see review notes above) — 8 real production indexes, deliberately not dropped:
-- DROP INDEX "block_miner_rewards_user_created_at";
-- DROP INDEX "internal_offerwall_user_status_completed_at";
-- DROP INDEX "mining_rewards_log_user_reward_covering_idx";
-- DROP INDEX "offerwallme_user_status_created_at";
-- DROP INDEX "shortlink_powers_user_claimed_at";
-- DROP INDEX "users_powers_games_user_played_at";
-- DROP INDEX "youtube_watch_user_powers_user_claimed_at";
-- DROP INDEX "zerads_user_callback_at";

-- AlterTable (DROP DEFAULT / SET DEFAULT / SET DATA TYPE are always no-ops if already in the
-- target state — Postgres never errors re-applying the same default/type twice).
ALTER TABLE "antibot_profiles" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "auto_mining_v2_banner_impressions" ALTER COLUMN "title" SET DEFAULT '';
ALTER TABLE "ip_intelligence_cache" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "miners" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "page_views"
  ALTER COLUMN "path" SET DATA TYPE TEXT,
  ALTER COLUMN "referrer_domain" SET DATA TYPE TEXT,
  ALTER COLUMN "utm_source" SET DATA TYPE TEXT,
  ALTER COLUMN "utm_medium" SET DATA TYPE TEXT,
  ALTER COLUMN "utm_campaign" SET DATA TYPE TEXT;

ALTER TABLE "partner_game_votes" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "partner_games" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "ptc_ad_tiers"
  ALTER COLUMN "label" SET DATA TYPE TEXT,
  ALTER COLUMN "ad_type" SET DATA TYPE TEXT;

ALTER TABLE "ptp_ads"
  ALTER COLUMN "status" SET DEFAULT 'pending_approval',
  ALTER COLUMN "paid_usd" SET DEFAULT 0,
  ALTER COLUMN "asset" SET DEFAULT 'SHIB',
  ALTER COLUMN "cost_usd" SET DEFAULT 0;

ALTER TABLE "ptp_earnings" ALTER COLUMN "amount_usd" SET DATA TYPE DECIMAL(20,2);

ALTER TABLE "sala_tiles" ALTER COLUMN "sala_rack_id" DROP DEFAULT;

ALTER TABLE "shortlink_powers"
  ALTER COLUMN "claimed_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
  ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

ALTER TABLE "sidebar_nav_config" ALTER COLUMN "updated_at" DROP DEFAULT;

-- IF NOT EXISTS: already added earlier this session (raw SQL) to local dev / anywhere this
-- migration ran before; absent on real production until now.
ALTER TABLE "support_messages"
  ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMP(3);

ALTER TABLE "telegram_outbox_events" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "transparency_liquidity_pool_positions" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "transparency_tracked_wallets" ALTER COLUMN "display_mode" SET DATA TYPE TEXT;

ALTER TABLE "transparency_wallet_snapshots"
  ALTER COLUMN "chains" DROP DEFAULT,
  ALTER COLUMN "tokens" DROP DEFAULT,
  ALTER COLUMN "nfts" DROP DEFAULT;

ALTER TABLE "user_owned_machines" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "user_vault" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "lifetime_mined_pol" DECIMAL(20,8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "utm_source" SET DATA TYPE TEXT,
  ALTER COLUMN "utm_medium" SET DATA TYPE TEXT,
  ALTER COLUMN "utm_campaign" SET DATA TYPE TEXT,
  ALTER COLUMN "referrer_domain" SET DATA TYPE TEXT;

ALTER TABLE "youtube_video_votes" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "youtuber_profiles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- SKIPPED (see review notes above) — real manual backup tables + a removed-feature leftover,
-- deliberately not dropped:
-- DROP TABLE "_bkp_um_recover_20260520";
-- DROP TABLE "_bkp_uom_recover_20260520";
-- DROP TABLE "stream_destinations";

-- CreateIndex (IF NOT EXISTS: genuinely new on both sides, guarded anyway for safety)
CREATE INDEX IF NOT EXISTS "game_session_logs_success_reward_granted_created_at_idx" ON "game_session_logs"("success", "reward_granted", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "support_messages_archived_idx" ON "support_messages"("archived");
CREATE INDEX IF NOT EXISTS "zerads_ptc_callbacks_created_at_idx" ON "zerads_ptc_callbacks"("created_at");

-- AddForeignKey — always follows a DROP CONSTRAINT IF EXISTS above (or, for
-- zerads_ptc_callbacks, never existed at all), so the constraint is guaranteed absent going
-- into each of these on both a fresh DB and real production. Guarded with a DO block anyway
-- since ADD CONSTRAINT has no native IF NOT EXISTS in Postgres.
DO $$ BEGIN
  ALTER TABLE "shortlink_powers" ADD CONSTRAINT "shortlink_powers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ptp_ads" ADD CONSTRAINT "ptp_ads_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "ptc_ad_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "zerads_ptc_callbacks" ADD CONSTRAINT "zerads_ptc_callbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "offerwallme_callbacks" ADD CONSTRAINT "offerwallme_callbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "moneyrain_callbacks" ADD CONSTRAINT "moneyrain_callbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RenameIndex — the OLD name only exists on real production (legacy history); a fresh DB
-- built from this repo's own init migration already has the NEW (current) name from the
-- start, so the old name never exists there. Guarded so it's a no-op on fresh DBs.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'referral_earnings_referrer_created_idx') THEN
    ALTER INDEX "referral_earnings_referrer_created_idx" RENAME TO "referral_earnings_referrer_id_created_at_idx";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'tournament_score_contributions_tournament_id_source_type_source') THEN
    ALTER INDEX "tournament_score_contributions_tournament_id_source_type_source" RENAME TO "tournament_score_contributions_tournament_id_source_type_so_key";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'tournament_shadow_validation_alerts_tournament_id_detected_at_i') THEN
    ALTER INDEX "tournament_shadow_validation_alerts_tournament_id_detected_at_i" RENAME TO "tournament_shadow_validation_alerts_tournament_id_detected__idx";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'transparency_liquidity_pool_positions_wallet_id_chain_id_contra') THEN
    ALTER INDEX "transparency_liquidity_pool_positions_wallet_id_chain_id_contra" RENAME TO "transparency_liquidity_pool_positions_wallet_id_chain_id_co_key";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'transparency_liquidity_pool_positions_wallet_id_status_chain_id') THEN
    ALTER INDEX "transparency_liquidity_pool_positions_wallet_id_status_chain_id" RENAME TO "transparency_liquidity_pool_positions_wallet_id_status_chai_idx";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'user_daily_task_progress_user_id_task_definition_id_period_key_') THEN
    ALTER INDEX "user_daily_task_progress_user_id_task_definition_id_period_key_" RENAME TO "user_daily_task_progress_user_id_task_definition_id_period__key";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'user_mini_pass_mission_progress_user_id_mission_id_period_key_k') THEN
    ALTER INDEX "user_mini_pass_mission_progress_user_id_mission_id_period_key_k" RENAME TO "user_mini_pass_mission_progress_user_id_mission_id_period_k_key";
  END IF;
END $$;
