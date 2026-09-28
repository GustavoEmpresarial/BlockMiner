-- AlterTable
ALTER TABLE "ptc_ad_tiers" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'SHIB';

-- Seed default tiers for SHIB, POL and BLK if not already present
INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'SHIB Rápido 5s', 'window', 5, 15, 12, 'SHIB', true, 1
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'SHIB Rápido 5s');

INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'SHIB Padrão 15s', 'window', 15, 35, 30, 'SHIB', true, 3
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'SHIB Padrão 15s');

INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'SHIB Destaque 30s', 'window', 30, 60, 50, 'SHIB', true, 4
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'SHIB Destaque 30s');

INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'SHIB Premium 60s', 'window', 60, 100, 85, 'SHIB', true, 5
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'SHIB Premium 60s');

-- POL Tiers
INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'POL Rápido 5s', 'window', 5, 0.002, 0.0016, 'POL', true, 10
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'POL Rápido 5s');

INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'POL Padrão 15s', 'window', 15, 0.006, 0.0050, 'POL', true, 12
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'POL Padrão 15s');

INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'POL Destaque 30s', 'window', 30, 0.010, 0.0080, 'POL', true, 13
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'POL Destaque 30s');

INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'POL Premium 60s', 'window', 60, 0.020, 0.0160, 'POL', true, 14
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'POL Premium 60s');

-- BLK Tiers
INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'BLK Rápido 5s', 'window', 5, 0.000060, 0.000050, 'BLK', true, 20
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'BLK Rápido 5s');

INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'BLK Padrão 15s', 'window', 15, 0.000150, 0.000120, 'BLK', true, 22
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'BLK Padrão 15s');

INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'BLK Destaque 30s', 'window', 30, 0.000280, 0.000220, 'BLK', true, 23
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'BLK Destaque 30s');

INSERT INTO "ptc_ad_tiers" ("label", "ad_type", "duration_seconds", "price_per_view_shib", "reward_per_view_shib", "currency", "is_active", "sort_order")
SELECT 'BLK Premium 60s', 'window', 60, 0.000500, 0.000400, 'BLK', true, 24
WHERE NOT EXISTS (SELECT 1 FROM "ptc_ad_tiers" WHERE "label" = 'BLK Premium 60s');
