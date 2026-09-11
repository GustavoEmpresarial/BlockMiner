ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_subject" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_google_subject_key" ON "users"("google_subject");
