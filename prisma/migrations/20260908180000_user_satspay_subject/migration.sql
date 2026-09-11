-- SatsPay OAuth identity link on users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "satspay_subject" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_satspay_subject_key" ON "users"("satspay_subject");
