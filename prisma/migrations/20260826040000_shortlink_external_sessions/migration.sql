-- CreateTable
CREATE TABLE "shortlink_external_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'pastead',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "hash_rate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "shortlink_external_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shortlink_external_sessions_token_key" ON "shortlink_external_sessions"("token");

-- CreateIndex
CREATE INDEX "shortlink_external_sessions_user_id_provider_status_idx" ON "shortlink_external_sessions"("user_id", "provider", "status");

-- CreateIndex
CREATE INDEX "shortlink_external_sessions_user_id_provider_completed_at_idx" ON "shortlink_external_sessions"("user_id", "provider", "completed_at");

-- AddForeignKey
ALTER TABLE "shortlink_external_sessions" ADD CONSTRAINT "shortlink_external_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
