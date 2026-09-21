import { z } from "zod";
import { EVM_ADDRESS_REGEX } from "../../shared/security/walletAddress.js";

/** Validates that a string is either empty/null or a safe HTTP/HTTPS or local path URL */
export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim();
  if (trimmed === "") return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true; // Local asset/upload path
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function assertValidTransparencyWalletAddress(address: string): string {
  if (!EVM_ADDRESS_REGEX.test(address)) {
    const err = new Error("Endereço de carteira inválido.") as Error & { code?: string };
    err.code = "INVALID_ADDRESS";
    throw err;
  }
  return address;
}

export function parsePositiveIntParam(raw: unknown): number | null {
  const s = String(raw || "").trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// ─── Transparency Entries (Despesas & Receitas) ──────────────────────────────

export const transparencyEntryCreateSchema = z.object({
  type: z.enum(["expense", "income"]).default("expense"),
  category: z.string().trim().min(1).max(50).default("misc"),
  incomeCategory: z.string().trim().max(50).nullable().optional(),
  name: z.string().trim().min(2, "Nome deve ter no mínimo 2 caracteres").max(150),
  description: z.string().trim().max(2000).nullable().optional(),
  provider: z.string().trim().max(100).nullable().optional(),
  providerUrl: z.string().trim().refine(isSafeHttpUrl, "URL do provedor deve ser http(s)://").nullable().optional(),
  imageUrl: z.string().trim().refine(isSafeHttpUrl, "URL da imagem/comprovante inválida").nullable().optional(),
  amountUsd: z.coerce.number().min(0, "Valor em USD não pode ser negativo"),
  amountOriginal: z.coerce.number().min(0).nullable().optional(),
  currencyCode: z.string().trim().min(2).max(10).default("USD"),
  fxRateUsd: z.coerce.number().positive().nullable().optional(),
  period: z.enum(["monthly", "annual", "one_time", "daily"]).default("monthly"),
  entryDate: z.coerce.date().nullable().optional(),
  direction: z.enum(["in", "out"]).nullable().optional(),
  blockchain: z.string().trim().max(50).nullable().optional(),
  walletAddress: z.string().trim().max(100).nullable().optional(),
  txHash: z.string().trim().max(150).nullable().optional(),
  referenceUrl: z.string().trim().refine(isSafeHttpUrl, "URL de referência deve ser http(s)://").nullable().optional(),
  isOnChain: z.boolean().default(false),
  isPaid: z.boolean().default(true),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

export const transparencyEntryUpdateSchema = transparencyEntryCreateSchema.partial();

// ─── External Investments ("Outros Investimentos") ───────────────────────────

export const externalInvestmentCreateSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter no mínimo 2 caracteres").max(100),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.string().trim().refine(isSafeHttpUrl, "URL da logo/imagem inválida").nullable().optional(),
  linkUrl: z.string().trim().refine(isSafeHttpUrl, "Link do investimento deve ser uma URL segura (https://)").nullable().optional(),
  amountInvestedUsd: z.coerce.number().min(0, "Valor investido não pode ser negativo").default(0),
  amountWithdrawnUsd: z.coerce.number().min(0, "Valor resgatado não pode ser negativo").default(0),
  roiForecast: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const externalInvestmentUpdateSchema = externalInvestmentCreateSchema.partial();

// ─── Tracked Wallets (Carteiras da Tesouraria) ────────────────────────────────

export const trackedWalletCreateSchema = z.object({
  label: z.string().trim().min(2, "Rótulo deve ter no mínimo 2 caracteres").max(100),
  address: z.string().trim().min(20).max(100).refine((addr) => EVM_ADDRESS_REGEX.test(addr), {
    message: "Endereço EVM inválido (formato esperado: 0x seguido de 40 dígitos hexadecimais)",
  }),
  chain: z.string().trim().min(1).max(50).default("polygon"),
  assetSymbol: z.string().trim().min(1).max(20).default("POL"),
  explorerBaseUrl: z.string().trim().refine(isSafeHttpUrl, "URL do explorer inválida").nullable().optional(),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  includeInTotals: z.boolean().default(true),
  displayMode: z.string().trim().max(50).default("total_received"),
  sortOrder: z.coerce.number().int().default(0),
  manualUsdValue: z.coerce.number().min(0, "Valor manual em USD deve ser maior ou igual a zero").nullable().optional(),
  manualValueNote: z.string().trim().max(255).nullable().optional(),
});

export const trackedWalletUpdateSchema = trackedWalletCreateSchema.partial();

// ─── Physical Hardware (ASIC / Mineração Física) ─────────────────────────────

export const hardwareAssetCreateSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter no mínimo 2 caracteres").max(100),
  manufacturer: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["running", "maintenance", "retired"]).default("running"),
  statusLabel: z.string().trim().max(50).nullable().optional(),
  purchaseCostUsd: z.coerce.number().min(0, "Custo de aquisição não pode ser negativo"),
  transitWeeks: z.coerce.number().int().min(0).nullable().optional(),
  purchaseNote: z.string().trim().max(2000).nullable().optional(),
  specs: z.any().optional(),
  model3dUrl: z.string().trim().refine(isSafeHttpUrl, "URL 3D inválida").nullable().optional(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const hardwareAssetUpdateSchema = hardwareAssetCreateSchema.partial();

// ─── Hardware Profit Logs (Lançamento de Lucros em Satoshis) ──────────────────

export const hardwareProfitLogCreateSchema = z.object({
  satoshiAmount: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
    .refine((val) => {
      try {
        return BigInt(val) > 0n;
      } catch {
        return false;
      }
    }, { message: "Quantidade de satoshis deve ser positiva." })
    .transform((val) => BigInt(val)),
  btcUsdPrice: z.coerce.number().positive("Cotação BTC/USD deve ser positiva."),
  earnedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const hardwareProfitLogUpdateSchema = z.object({
  satoshiAmount: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
    .refine((val) => {
      try {
        return BigInt(val) > 0n;
      } catch {
        return false;
      }
    }, { message: "Quantidade de satoshis deve ser positiva." })
    .transform((val) => BigInt(val))
    .optional(),
  btcUsdPrice: z.coerce.number().positive("Cotação BTC/USD deve ser positiva.").optional(),
  earnedAt: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
