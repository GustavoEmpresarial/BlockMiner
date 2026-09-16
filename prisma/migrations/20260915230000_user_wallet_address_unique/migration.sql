-- One wallet address may only be linked to one account (anti multi-accounting).
--
-- Drift found on 15/09/2026: production already enforces this index, but it was never in
-- schema.prisma nor in any migration — a database rebuilt from the schema would silently
-- lose the guard and let the same wallet be linked to unlimited accounts. Prisma's schema
-- cannot express a functional partial unique index, so it lives here.
--
-- `IF NOT EXISTS` makes this a no-op on production, where the index is already present
-- under this exact name.
CREATE UNIQUE INDEX IF NOT EXISTS "users_wallet_address_key"
ON "users" (lower("wallet_address"))
WHERE "wallet_address" IS NOT NULL AND "wallet_address" <> '';
