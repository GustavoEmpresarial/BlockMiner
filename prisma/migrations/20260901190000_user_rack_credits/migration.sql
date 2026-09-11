-- Rack credits for inventory2 shop/offer purchases.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rack_credits" INTEGER NOT NULL DEFAULT 0;

-- Track purchased racks so storing them returns a credit (room-bundled racks stay free).
ALTER TABLE "user_visual_rack_placements"
  ADD COLUMN IF NOT EXISTS "purchased" BOOLEAN NOT NULL DEFAULT false;
