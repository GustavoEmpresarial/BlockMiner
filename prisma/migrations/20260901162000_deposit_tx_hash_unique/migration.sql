-- One on-chain deposit hash may only credit once (shared transactions table: deposits only).
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_deposit_tx_hash_key"
ON "transactions" ("tx_hash")
WHERE "type" = 'deposit' AND "tx_hash" IS NOT NULL;
