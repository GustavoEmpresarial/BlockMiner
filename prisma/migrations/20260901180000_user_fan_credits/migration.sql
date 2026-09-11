-- Cooling fan credits for inventory2 sidebar + shop/offer purchases.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fan_credits" INTEGER NOT NULL DEFAULT 0;

-- Preserve pre-sale implicit storage: stored = visual racks − mounted fans.
WITH room_visuals AS (
  SELECT
    ur.user_id,
    GREATEST(
      0,
      CEIL(COALESCE((SELECT COUNT(*)::numeric FROM user_racks r WHERE r.room_id = ur.id), 0) / 8)
    )::int AS visual_count
  FROM user_rooms ur
),
user_visual AS (
  SELECT user_id, SUM(visual_count)::int AS total_visual
  FROM room_visuals
  GROUP BY user_id
),
user_mounted AS (
  SELECT user_id, COUNT(*)::int AS total_mounted
  FROM user_visual_fan_placements
  GROUP BY user_id
)
UPDATE users u
SET fan_credits = GREATEST(0, COALESCE(uv.total_visual, 0) - COALESCE(um.total_mounted, 0))
FROM user_visual uv
FULL OUTER JOIN user_mounted um ON um.user_id = uv.user_id
WHERE u.id = COALESCE(uv.user_id, um.user_id);
