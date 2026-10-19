-- "Miner's Contract": per-version record that a player stamped the key clauses and signed the Terms of Use.
CREATE TABLE "user_terms_acceptances" (
    "user_id" INTEGER NOT NULL,
    "terms_version" TEXT NOT NULL,
    "clause_count" INTEGER NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_terms_acceptances_pkey" PRIMARY KEY ("user_id", "terms_version")
);

ALTER TABLE "user_terms_acceptances"
  ADD CONSTRAINT "user_terms_acceptances_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
