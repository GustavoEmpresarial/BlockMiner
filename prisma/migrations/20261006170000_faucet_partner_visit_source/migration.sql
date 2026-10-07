-- Additive and nullable. Rows already stored stay NULL and are logged as unknown.
ALTER TABLE "faucet_partner_visits" ADD COLUMN "source" TEXT;
