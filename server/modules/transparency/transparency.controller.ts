import type { Request, Response } from "express";
import * as transparencyRepo from "./transparency.repository.js";
import { assertValidTransparencyWalletAddress } from "./transparency.validation.js";
import { fetchWalletNativeActivity } from "./transparency.activity.service.js";
import { normalizeLegacyWalletFlags } from "./transparency.legacy-wallets.js";
import { fetchAllBasePrices } from "./transparency.wallet-snapshot.service.js";
import {
  computeEarnedUsd,
  computeHardwareRoiSummary,
  mapProfitLogForPublic,
  parsePositiveDecimal,
  parseSatoshiInput,
} from "./transparency.hardware-profit.js";

function mapWalletForPublic(w: Awaited<ReturnType<typeof transparencyRepo.listPublicWalletsWithSnapshot>>[number]) {
  const totalUsd = w.manualUsdValue ?? w.snapshot?.totalUsd ?? null;
  const { isActive, includeInTotals } = normalizeLegacyWalletFlags({
    address: w.address,
    isActive: w.isActive,
    includeInTotals: w.includeInTotals,
  });
  return {
    id: w.id,
    label: w.label,
    address: w.address,
    chain: w.chain,
    assetSymbol: w.assetSymbol,
    explorerBaseUrl: w.explorerBaseUrl,
    displayMode: w.displayMode,
    isActive,
    includeInTotals,
    manualUsdValue: w.manualUsdValue,
    manualValueNote: w.manualValueNote,
    warming: w.manualUsdValue == null && !w.snapshot,
    totalUsd,
    valueUsd: totalUsd,
    valuePol: w.snapshot?.valuePol ?? null,
    chains: w.snapshot?.chains ?? [],
    tokens: w.snapshot?.tokens ?? [],
    nfts: w.snapshot?.nfts ?? [],
    fetchedAt: w.snapshot?.fetchedAt ?? null,
    liquidityPools: (w.liquidityPools ?? []).map((p) => ({
      id: p.id,
      chainId: p.chainId,
      chainName: p.chainName,
      contractAddress: p.contractAddress,
      tokenId: p.tokenId,
      poolLabel: p.poolLabel,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      explorerUrl: p.explorerUrl,
      openseaUrl: p.openseaUrl,
      liquidityUsd: p.liquidityUsd,
      status: p.status,
    })),
  };
}

function mapHardwareAsset(asset: Awaited<ReturnType<typeof transparencyRepo.listActiveHardwareAssets>>[number]) {
  const specs = Array.isArray(asset.specs) ? asset.specs : [];
  const profitLogs = asset.profitLogs ?? [];
  const purchaseCostUsd = Number(asset.purchaseCostUsd);
  const profitSummary = computeHardwareRoiSummary(
    purchaseCostUsd,
    profitLogs.map((log) => ({
      earnedAt: log.earnedAt,
      earnedUsd: log.earnedUsd,
      satoshiAmount: log.satoshiAmount,
    })),
  );
  return {
    id: asset.id,
    name: asset.name,
    manufacturer: asset.manufacturer,
    description: asset.description,
    status: asset.status,
    statusLabel: asset.statusLabel,
    purchaseCostUsd: asset.purchaseCostUsd,
    transitWeeks: asset.transitWeeks,
    purchaseNote: asset.purchaseNote,
    specs,
    model3dUrl: asset.model3dUrl,
    sortOrder: asset.sortOrder,
    profitSummary,
    profitLogs: profitLogs.map(mapProfitLogForPublic),
  };
}

export async function getPublicEntries(_req: Request, res: Response) {
  try {
    const [entries, trackedWallet, publicWallets] = await Promise.all([
      transparencyRepo.listActiveTransparencyEntries(),
      transparencyRepo.findWalletSettings(),
      transparencyRepo.listPublicActiveWallets(),
    ]);
    res.json({
      ok: true,
      entries,
      trackedWallet: trackedWallet?.address || publicWallets[0]?.address || null,
      trackedWallets: publicWallets,
    });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar dados." });
  }
}

export async function getPublicWithdrawalStats(_req: Request, res: Response) {
  try {
    const agg = await transparencyRepo.aggregateCompletedWithdrawals();
    const totalPol = Number(agg._sum.amount ?? 0);
    res.json({
      ok: true,
      currency: "POL",
      network: "Polygon",
      totalPol,
      totalCount: agg._count.id,
      polUsdPrice: null,
      totalUsd: null,
    });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar saques." });
  }
}

/** Deferred — see module doc-comment. */
export async function getPublicWalletStats(_req: Request, res: Response) {
  res.json({
    ok: true,
    warming: true,
    address: null,
    apiKeyConfigured: false,
    totalInPol: null,
    totalOutPol: null,
  });
}

/**
 * Serves the multi-chain snapshot persisted by wallet-snapshot cron (DB read, no live RPC).
 */
export async function getPublicTrackedWalletsLive(_req: Request, res: Response) {
  try {
    const wallets = await transparencyRepo.listPublicWalletsWithSnapshot();
    const out = wallets.map(mapWalletForPublic);
    const anyWarming = out.some((w) => w.warming);
    res.json({ ok: true, warming: anyWarming, polUsdPrice: null, wallets: out });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar carteiras rastreadas." });
  }
}

export async function getPublicExternalInvestments(_req: Request, res: Response) {
  try {
    res.json({ ok: true, investments: await transparencyRepo.listActiveExternalInvestments() });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar investimentos." });
  }
}

export async function getPublicHardwareAssets(_req: Request, res: Response) {
  try {
    const assets = await transparencyRepo.listActiveHardwareAssets();
    res.json({ ok: true, assets: assets.map(mapHardwareAsset) });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar ativos físicos." });
  }
}

export async function adminExternalInvestmentList(_req: Request, res: Response) {
  try {
    res.json({ ok: true, investments: await transparencyRepo.listAllExternalInvestments() });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar investimentos." });
  }
}

export async function adminExternalInvestmentCreate(req: Request, res: Response) {
  try {
    const investment = await transparencyRepo.createExternalInvestment(req.body);
    res.status(201).json({ ok: true, investment });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao criar investimento." });
  }
}

export async function adminExternalInvestmentUpdate(req: Request, res: Response) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    const current = await transparencyRepo.findExternalInvestmentById(id);
    if (!current) {
      res.status(404).json({ ok: false, message: "Investimento não encontrado." });
      return;
    }
    const investment = await transparencyRepo.updateExternalInvestment(id, req.body);
    res.json({ ok: true, investment });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao atualizar investimento." });
  }
}

export async function adminExternalInvestmentDelete(req: Request, res: Response) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    await transparencyRepo.deleteExternalInvestment(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao remover investimento." });
  }
}

export async function adminList(_req: Request, res: Response) {
  try {
    res.json({ ok: true, entries: await transparencyRepo.listAllTransparencyEntries() });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar entradas." });
  }
}

export async function adminCreate(req: Request, res: Response) {
  try {
    const entry = await transparencyRepo.createTransparencyEntry(req.body);
    res.json({ ok: true, entry });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao criar entrada." });
  }
}

export async function adminUpdate(req: Request, res: Response) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    const current = await transparencyRepo.findTransparencyEntryById(id);
    if (!current) {
      res.status(404).json({ ok: false, message: "Entrada não encontrada." });
      return;
    }
    const entry = await transparencyRepo.updateTransparencyEntry(id, req.body);
    res.json({ ok: true, entry });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao atualizar." });
  }
}

export async function adminDelete(req: Request, res: Response) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    await transparencyRepo.deleteTransparencyEntry(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao deletar." });
  }
}

export async function adminWalletGetSettings(_req: Request, res: Response) {
  try {
    const row = await transparencyRepo.findWalletSettings();
    res.json({ ok: true, address: row?.address || null });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao carregar carteira." });
  }
}

export async function adminWalletPutSettings(req: Request, res: Response) {
  const body = req.body ?? {};
  try {
    if (!Object.prototype.hasOwnProperty.call(body, "address")) {
      res.status(400).json({ ok: false, message: "Body deve incluir address (string vazia para limpar)." });
      return;
    }
    const trimmed = String(body.address).trim();
    const stored = trimmed ? assertValidTransparencyWalletAddress(trimmed) : null;
    await transparencyRepo.upsertWalletSettings(stored);
    res.json({ ok: true, address: stored });
  } catch (e) {
    res.status(400).json({ ok: false, message: e instanceof Error ? e.message : "Erro ao guardar carteira." });
  }
}

export async function adminTrackedWalletList(_req: Request, res: Response) {
  try {
    res.json({ ok: true, wallets: await transparencyRepo.listTrackedWallets(true) });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao listar carteiras rastreadas." });
  }
}

export async function adminTrackedWalletCreate(req: Request, res: Response) {
  try {
    const wallet = await transparencyRepo.createTrackedWallet(req.body);
    res.status(201).json({ ok: true, wallet });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao criar carteira rastreada." });
  }
}

export async function adminTrackedWalletUpdate(req: Request, res: Response) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    const current = await transparencyRepo.findTrackedWalletById(id);
    if (!current) {
      res.status(404).json({ ok: false, message: "Carteira não encontrada." });
      return;
    }
    const wallet = await transparencyRepo.updateTrackedWallet(id, req.body);
    res.json({ ok: true, wallet });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao atualizar carteira rastreada." });
  }
}

export async function adminTrackedWalletDelete(req: Request, res: Response) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    await transparencyRepo.deleteTrackedWallet(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao remover carteira rastreada." });
  }
}

export async function adminWalletGetActivity(_req: Request, res: Response) {
  try {
    const row = await transparencyRepo.findWalletSettings();
    const address = row?.address || null;
    if (!address) {
      res.json({
        ok: true,
        address: null,
        apiKeyConfigured: false,
        balancePol: null,
        blockNumber: null,
        note: "No wallet address is configured for transparency tracking.",
        summary: { totalInPol: null, totalOutPol: null, totalInUsd: null, totalOutUsd: null, movementCount: 0 },
        movements: [],
        error: null,
      });
      return;
    }
    const activity = await fetchWalletNativeActivity(address);
    res.json({ ok: true, ...activity });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar atividade da carteira." });
  }
}

export async function adminTrackedWalletActivity(_req: Request, res: Response) {
  try {
    const wallets = await transparencyRepo.listTrackedWallets(true);
    const out = await Promise.all(
      wallets.map(async (w) => {
        const snapshot = await transparencyRepo.findWalletSnapshot(w.id);
        return {
          id: w.id,
          label: w.label,
          address: w.address,
          displayMode: w.displayMode,
          totalUsd: w.manualUsdValue ?? snapshot?.totalUsd ?? null,
          valuePol: snapshot?.valuePol ?? null,
          fetchedAt: snapshot?.fetchedAt ?? null,
          chainCount: Array.isArray(snapshot?.chains) ? snapshot.chains.length : 0,
        };
      }),
    );
    res.json({
      ok: true,
      apiKeyConfigured: false,
      summary: { totalInPol: 0, totalOutPol: 0, totalInUsd: null, totalOutUsd: null, movementCount: 0, walletCount: wallets.length },
      wallets: out,
    });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar atividade das carteiras rastreadas." });
  }
}

export async function adminHardwareAssetList(_req: Request, res: Response) {
  try {
    const assets = await transparencyRepo.listAllHardwareAssets();
    res.json({
      ok: true,
      assets: assets.map((asset) => ({
        ...asset,
        purchaseCostUsd: Number(asset.purchaseCostUsd),
      })),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Erro ao buscar ativos físicos.",
    });
  }
}

export async function adminHardwareAssetCreate(req: Request, res: Response) {
  try {
    const asset = await transparencyRepo.createHardwareAsset(req.body);
    res.status(201).json({ ok: true, asset });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao criar ativo." });
  }
}

export async function adminHardwareAssetUpdate(req: Request, res: Response) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    const current = await transparencyRepo.findHardwareAssetById(id);
    if (!current) {
      res.status(404).json({ ok: false, message: "Ativo não encontrado." });
      return;
    }
    const asset = await transparencyRepo.updateHardwareAsset(id, req.body);
    res.json({ ok: true, asset });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao atualizar ativo." });
  }
}

export async function adminHardwareAssetDelete(req: Request, res: Response) {
  const id = parseInt(String(req.params.id || ""), 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    await transparencyRepo.deleteHardwareAsset(id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao remover ativo." });
  }
}

function parseHardwareAssetId(req: Request): number | null {
  const id = parseInt(String(req.params.assetId || ""), 10);
  return id > 0 ? id : null;
}

async function resolveProfitLogPayload(req: Request): Promise<
  | { ok: true; earnedAt: Date; satoshi: bigint; btcUsdPrice: number; earnedUsd: number; notes: string | null }
  | { ok: false; status: number; message: string }
> {
  const satoshi = parseSatoshiInput(req.body?.satoshiAmount);
  if (!satoshi) {
    return { ok: false, status: 400, message: "Quantidade de satoshis inválida." };
  }

  let btcUsdPrice = parsePositiveDecimal(req.body?.btcUsdPrice);
  if (!btcUsdPrice) {
    const prices = await fetchAllBasePrices();
    btcUsdPrice = prices.btc ?? null;
  }
  if (!btcUsdPrice) {
    return { ok: false, status: 400, message: "Preço BTC/USD indisponível. Informe manualmente." };
  }

  const earnedAtRaw = req.body?.earnedAt;
  const earnedAt = earnedAtRaw ? new Date(String(earnedAtRaw)) : new Date();
  if (Number.isNaN(earnedAt.getTime())) {
    return { ok: false, status: 400, message: "Data de lançamento inválida." };
  }

  const notesRaw = req.body?.notes;
  const notes = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;
  const earnedUsd = computeEarnedUsd(satoshi, btcUsdPrice);

  return { ok: true, earnedAt, satoshi, btcUsdPrice, earnedUsd, notes };
}

export async function adminBtcUsdPrice(_req: Request, res: Response) {
  try {
    const prices = await fetchAllBasePrices();
    res.json({ ok: true, btcUsdPrice: prices.btc });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar preço BTC." });
  }
}

export async function adminHardwareProfitLogList(req: Request, res: Response) {
  const assetId = parseHardwareAssetId(req);
  if (!assetId) {
    res.status(400).json({ ok: false, message: "ID do ativo inválido." });
    return;
  }
  try {
    const asset = await transparencyRepo.findHardwareAssetById(assetId);
    if (!asset) {
      res.status(404).json({ ok: false, message: "Ativo não encontrado." });
      return;
    }
    const logs = await transparencyRepo.listHardwareProfitLogs(assetId);
    const purchaseCostUsd = Number(asset.purchaseCostUsd);
    res.json({
      ok: true,
      profitSummary: computeHardwareRoiSummary(
        purchaseCostUsd,
        logs.map((log) => ({
          earnedAt: log.earnedAt,
          earnedUsd: log.earnedUsd,
          satoshiAmount: log.satoshiAmount,
        })),
      ),
      profitLogs: logs.map(mapProfitLogForPublic),
    });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar lucros." });
  }
}

export async function adminHardwareProfitLogCreate(req: Request, res: Response) {
  const assetId = parseHardwareAssetId(req);
  if (!assetId) {
    res.status(400).json({ ok: false, message: "ID do ativo inválido." });
    return;
  }
  try {
    const asset = await transparencyRepo.findHardwareAssetById(assetId);
    if (!asset) {
      res.status(404).json({ ok: false, message: "Ativo não encontrado." });
      return;
    }
    const payload = await resolveProfitLogPayload(req);
    if (!payload.ok) {
      res.status(payload.status).json({ ok: false, message: payload.message });
      return;
    }
    const log = await transparencyRepo.createHardwareProfitLog({
      hardwareAsset: { connect: { id: assetId } },
      earnedAt: payload.earnedAt,
      satoshiAmount: payload.satoshi,
      btcUsdPrice: payload.btcUsdPrice,
      earnedUsd: payload.earnedUsd,
      notes: payload.notes,
    });
    res.status(201).json({ ok: true, profitLog: mapProfitLogForPublic(log) });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao registrar lucro." });
  }
}

export async function adminHardwareProfitLogUpdate(req: Request, res: Response) {
  const assetId = parseHardwareAssetId(req);
  const logId = parseInt(String(req.params.id || ""), 10);
  if (!assetId || !logId) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    const current = await transparencyRepo.findHardwareProfitLogById(logId);
    if (!current || current.hardwareAssetId !== assetId) {
      res.status(404).json({ ok: false, message: "Lançamento não encontrado." });
      return;
    }
    const payload = await resolveProfitLogPayload(req);
    if (!payload.ok) {
      res.status(payload.status).json({ ok: false, message: payload.message });
      return;
    }
    const log = await transparencyRepo.updateHardwareProfitLog(logId, {
      earnedAt: payload.earnedAt,
      satoshiAmount: payload.satoshi,
      btcUsdPrice: payload.btcUsdPrice,
      earnedUsd: payload.earnedUsd,
      notes: payload.notes,
    });
    res.json({ ok: true, profitLog: mapProfitLogForPublic(log) });
  } catch (error) {
    res.status(400).json({ ok: false, message: error instanceof Error ? error.message : "Erro ao atualizar lucro." });
  }
}

export async function adminHardwareProfitLogDelete(req: Request, res: Response) {
  const assetId = parseHardwareAssetId(req);
  const logId = parseInt(String(req.params.id || ""), 10);
  if (!assetId || !logId) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    const current = await transparencyRepo.findHardwareProfitLogById(logId);
    if (!current || current.hardwareAssetId !== assetId) {
      res.status(404).json({ ok: false, message: "Lançamento não encontrado." });
      return;
    }
    await transparencyRepo.deleteHardwareProfitLog(logId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao remover lançamento." });
  }
}
