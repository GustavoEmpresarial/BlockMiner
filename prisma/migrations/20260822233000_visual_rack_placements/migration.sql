CREATE TABLE "user_visual_rack_placements" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "room_id" INTEGER NOT NULL,
    "visual_index" INTEGER NOT NULL,
    "floor_slot" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_visual_rack_placements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_visual_rack_placements_room_id_visual_index_key"
  ON "user_visual_rack_placements"("room_id", "visual_index");

CREATE INDEX "user_visual_rack_placements_user_id_room_id_idx"
  ON "user_visual_rack_placements"("user_id", "room_id");

CREATE UNIQUE INDEX "user_visual_rack_placements_room_floor_uidx"
  ON "user_visual_rack_placements"("room_id", "floor_slot")
  WHERE "floor_slot" IS NOT NULL;

ALTER TABLE "user_visual_rack_placements"
  ADD CONSTRAINT "user_visual_rack_placements_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_visual_rack_placements"
  ADD CONSTRAINT "user_visual_rack_placements_room_id_fkey"
  FOREIGN KEY ("room_id") REFERENCES "user_rooms"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
