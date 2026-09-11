-- Offerwall.GG S2S callback ledger
CREATE TABLE IF NOT EXISTS "offerwallgg_callbacks" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "trans_id" TEXT NOT NULL,
    "offer_name" TEXT,
    "offer_type" TEXT,
    "payout_usd" DOUBLE PRECISION NOT NULL,
    "pol_credited" DOUBLE PRECISION NOT NULL,
    "pol_price" DOUBLE PRECISION NOT NULL,
    "status" INTEGER NOT NULL,
    "request_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offerwallgg_callbacks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "offerwallgg_callbacks_trans_id_key" ON "offerwallgg_callbacks"("trans_id");
CREATE INDEX IF NOT EXISTS "offerwallgg_callbacks_user_id_idx" ON "offerwallgg_callbacks"("user_id");
CREATE INDEX IF NOT EXISTS "offerwallgg_callbacks_created_at_idx" ON "offerwallgg_callbacks"("created_at");

DO $$ BEGIN
  ALTER TABLE "offerwallgg_callbacks"
    ADD CONSTRAINT "offerwallgg_callbacks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
