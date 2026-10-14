-- Part stacks and grants distinguish common (white) from uncommon (green).
ALTER TABLE "user_part_stacks" ADD COLUMN "rarity" TEXT NOT NULL DEFAULT 'common';

DROP INDEX "user_part_stacks_user_id_part_slug_key";

CREATE UNIQUE INDEX "user_part_stacks_user_id_part_slug_rarity_key"
  ON "user_part_stacks"("user_id", "part_slug", "rarity");

ALTER TABLE "part_grants" ADD COLUMN "rarity" TEXT NOT NULL DEFAULT 'common';
