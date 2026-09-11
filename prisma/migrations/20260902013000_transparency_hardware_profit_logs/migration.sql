-- CreateTable
CREATE TABLE "transparency_hardware_profit_logs" (
    "id" SERIAL NOT NULL,
    "hardware_asset_id" INTEGER NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL,
    "satoshi_amount" BIGINT NOT NULL,
    "btc_usd_price" DECIMAL(20,8) NOT NULL,
    "earned_usd" DECIMAL(20,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transparency_hardware_profit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transparency_hardware_profit_logs_hardware_asset_id_earned_at_idx" ON "transparency_hardware_profit_logs"("hardware_asset_id", "earned_at");

-- AddForeignKey
ALTER TABLE "transparency_hardware_profit_logs" ADD CONSTRAINT "transparency_hardware_profit_logs_hardware_asset_id_fkey" FOREIGN KEY ("hardware_asset_id") REFERENCES "transparency_hardware_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
