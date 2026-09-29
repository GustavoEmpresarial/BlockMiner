-- Backfill / Update TransparencyEntry logos for operational subscriptions
UPDATE "transparency_entries"
SET "image_url" = '/media/transparency/contabo.png'
WHERE (LOWER("provider") LIKE '%contabo%' OR LOWER("name") LIKE '%contabo%' OR "id" = 2)
  AND ("image_url" IS NULL OR "image_url" = '');

UPDATE "transparency_entries"
SET "image_url" = '/media/transparency/claude.png'
WHERE (LOWER("provider") LIKE '%anthropic%' OR LOWER("name") LIKE '%claude%' OR "id" = 3)
  AND ("image_url" IS NULL OR "image_url" = '');

UPDATE "transparency_entries"
SET "image_url" = '/media/transparency/gemini.png'
WHERE (LOWER("provider") LIKE '%google%' OR LOWER("name") LIKE '%gemini%' OR "id" = 4)
  AND ("image_url" IS NULL OR "image_url" = '');
