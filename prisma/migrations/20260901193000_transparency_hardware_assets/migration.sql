-- CreateTable
CREATE TABLE "transparency_hardware_assets" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "status_label" TEXT,
    "purchase_cost_usd" DECIMAL(20,2) NOT NULL,
    "transit_weeks" INTEGER,
    "purchase_note" TEXT,
    "specs" JSONB NOT NULL DEFAULT '[]',
    "model_3d_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transparency_hardware_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transparency_hardware_assets_is_active_sort_order_idx" ON "transparency_hardware_assets"("is_active", "sort_order");

-- Seed default Antminer asset (matches prior hardcoded portal content)
INSERT INTO "transparency_hardware_assets" (
    "name",
    "manufacturer",
    "description",
    "status",
    "status_label",
    "purchase_cost_usd",
    "transit_weeks",
    "purchase_note",
    "specs",
    "model_3d_url",
    "sort_order",
    "is_active",
    "updated_at"
) VALUES (
    'Antminer S19J Pro',
    'Bitmain',
    'ASIC SHA-256 dedicado à mineração de Bitcoin. Hashrate nominal de 100 TH/s, eficiência energética de 29.5 J/TH. Adicionado ao caixa do projeto como ativo produtivo e de garantia de liquidez.',
    'running',
    'Em operação',
    640.00,
    2,
    'Unidade adquirida no mercado e enviada direto para o galpão de hospedagem. O trânsito total levou 2 semanas até a máquina ser instalada no rack e entrar em operação.',
    '[{"label":"Algoritmo","value":"SHA-256"},{"label":"Hashrate","value":"100 TH/s"},{"label":"Consumo","value":"~3050 W"},{"label":"Eficiência","value":"29.5 J/TH"},{"label":"Voltagem","value":"170–300 V"},{"label":"Fabricante","value":"Bitmain"}]'::jsonb,
    '/media/models/antminer-s19j-pro.glb',
    0,
    true,
    CURRENT_TIMESTAMP
);
