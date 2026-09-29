UPDATE "transparency_entries"
SET "image_url" = '/media/transparency/claude-mascot.png'
WHERE (LOWER("provider") LIKE '%anthropic%' OR LOWER("name") LIKE '%claude%' OR "id" = 3);
