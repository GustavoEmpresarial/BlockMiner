-- Profile photo behind a US$ 1 annual license paid from an internal crypto balance (never BLK).
-- New tables only; nothing is added to "users" (the most contended table at block close).
CREATE TABLE "user_avatars" (
    "user_id" INTEGER NOT NULL,
    "path" TEXT,
    "license_expires_at" TIMESTAMP(3),
    "upload_blocked" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "user_avatars_license_expires_at_idx" ON "user_avatars"("license_expires_at");

ALTER TABLE "user_avatars"
  ADD CONSTRAINT "user_avatars_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "avatar_licenses" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL,
    "usd_rate" DECIMAL(30,12) NOT NULL,
    "usd_price" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avatar_licenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "avatar_licenses_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "avatar_licenses_user_id_idempotency_key_key" ON "avatar_licenses"("user_id", "idempotency_key");
CREATE INDEX "avatar_licenses_user_id_expires_at_idx" ON "avatar_licenses"("user_id", "expires_at");

ALTER TABLE "avatar_licenses"
  ADD CONSTRAINT "avatar_licenses_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
