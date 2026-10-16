-- Stacked common parts dropped by offerwall credits. Not a spendable shop currency yet.
CREATE TABLE "user_part_stacks" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "part_slug" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_part_stacks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_part_stacks_user_id_part_slug_key" ON "user_part_stacks"("user_id", "part_slug");
CREATE INDEX "user_part_stacks_user_id_idx" ON "user_part_stacks"("user_id");

ALTER TABLE "user_part_stacks"
  ADD CONSTRAINT "user_part_stacks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "part_grants" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "part_slug" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "source_ref" TEXT NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "part_grants_source_source_ref_key" ON "part_grants"("source", "source_ref");
CREATE INDEX "part_grants_user_id_idx" ON "part_grants"("user_id");

ALTER TABLE "part_grants"
  ADD CONSTRAINT "part_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
