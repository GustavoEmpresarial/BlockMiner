CREATE TABLE "user_energy_generators" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'solar_panel',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_energy_generators_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_energy_generators_user_id_kind_idx" ON "user_energy_generators"("user_id", "kind");

ALTER TABLE "user_energy_generators"
  ADD CONSTRAINT "user_energy_generators_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
