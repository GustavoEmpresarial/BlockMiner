-- AI-generated personalized certificate per profile-photo license (name typed by the player after paying).
CREATE TABLE "avatar_certificates" (
    "license_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "holder_name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "path" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avatar_certificates_pkey" PRIMARY KEY ("license_id")
);

CREATE INDEX "avatar_certificates_user_id_idx" ON "avatar_certificates"("user_id");
CREATE INDEX "avatar_certificates_status_updated_at_idx" ON "avatar_certificates"("status", "updated_at");

ALTER TABLE "avatar_certificates"
  ADD CONSTRAINT "avatar_certificates_license_id_fkey"
  FOREIGN KEY ("license_id") REFERENCES "avatar_licenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "avatar_certificates"
  ADD CONSTRAINT "avatar_certificates_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
