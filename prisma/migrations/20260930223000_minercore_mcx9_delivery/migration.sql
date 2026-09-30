-- MinerCore MCX9 is the only offer miner with a .glb and a delayed grant.
-- Image miners keep delivery_delay_days = 0 and never get a delivery row.

ALTER TABLE "event_miners" ADD COLUMN "model_url" TEXT;
ALTER TABLE "event_miners" ADD COLUMN "delivery_delay_days" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "event_miner_deliveries" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "event_miner_id" INTEGER NOT NULL,
    "event_purchase_id" INTEGER NOT NULL,
    "deliver_at" TIMESTAMP(3) NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_miner_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_miner_deliveries_event_purchase_id_key" ON "event_miner_deliveries"("event_purchase_id");
CREATE INDEX "event_miner_deliveries_delivered_at_deliver_at_idx" ON "event_miner_deliveries"("delivered_at", "deliver_at");
CREATE INDEX "event_miner_deliveries_user_id_event_miner_id_idx" ON "event_miner_deliveries"("user_id", "event_miner_id");

ALTER TABLE "event_miner_deliveries" ADD CONSTRAINT "event_miner_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_miner_deliveries" ADD CONSTRAINT "event_miner_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "offer_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_miner_deliveries" ADD CONSTRAINT "event_miner_deliveries_event_miner_id_fkey" FOREIGN KEY ("event_miner_id") REFERENCES "event_miners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_miner_deliveries" ADD CONSTRAINT "event_miner_deliveries_event_purchase_id_fkey" FOREIGN KEY ("event_purchase_id") REFERENCES "event_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
