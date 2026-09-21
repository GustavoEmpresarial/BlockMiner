import { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Plus,
  RefreshCw,
  Loader2,
  TrendingUp,
  Clock,
  CheckCircle2,
  Trash2,
  Edit2,
  DollarSign,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../../lib/admin.api';
import type {
  HardwareAssetRow,
  HardwareProfitLogRow,
  HardwareRoiSummary,
} from './adminTransparency.types';

export default function HardwareAssetsTab() {
  const [assets, setAssets] = useState<HardwareAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);

  // Profit logs state for the selected asset
  const [profitSummary, setProfitSummary] = useState<HardwareRoiSummary | null>(null);
  const [profitLogs, setProfitLogs] = useState<HardwareProfitLogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Profit log form
  const [satoshiInput, setSatoshiInput] = useState('');
  const [btcUsdPriceInput, setBtcUsdPriceInput] = useState('');
  const [earnedAtInput, setEarnedAtInput] = useState(new Date().toISOString().slice(0, 10));
  const [notesInput, setNotesInput] = useState('');
  const [fetchingBtcPrice, setFetchingBtcPrice] = useState(false);
  const [savingProfit, setSavingProfit] = useState(false);

  // Edit / Delete profit log state
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [confirmDeleteLogId, setConfirmDeleteLogId] = useState<number | null>(null);

  // Asset Modal
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<HardwareAssetRow | null>(null);
  const [savingAsset, setSavingAsset] = useState(false);
  const [formAssetName, setFormAssetName] = useState('');
  const [formAssetManufacturer, setFormAssetManufacturer] = useState('');
  const [formAssetCost, setFormAssetCost] = useState('');
  const [formAssetStatus, setFormAssetStatus] = useState<'running' | 'maintenance' | 'retired'>('running');
  const [formAssetDescription, setFormAssetDescription] = useState('');

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; assets: HardwareAssetRow[] }>(
        '/admin/transparency/hardware-assets',
      );
      if (res.data.ok) {
        const list = res.data.assets || [];
        setAssets(list);
        if (list.length > 0 && !selectedAssetId) {
          setSelectedAssetId(list[0].id);
        }
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar equipamentos de hardware');
    } finally {
      setLoading(false);
    }
  }, [selectedAssetId]);

  const loadProfitLogs = useCallback(async (assetId: number) => {
    setLoadingLogs(true);
    try {
      const res = await api.get<{
        ok: boolean;
        profitSummary: HardwareRoiSummary;
        profitLogs: HardwareProfitLogRow[];
      }>(`/admin/transparency/hardware-assets/${assetId}/profit-logs`);
      if (res.data.ok) {
        setProfitSummary(res.data.profitSummary);
        setProfitLogs(res.data.profitLogs || []);
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar lucros do hardware');
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (selectedAssetId) {
      void loadProfitLogs(selectedAssetId);
    }
  }, [selectedAssetId, loadProfitLogs]);

  async function handleFetchBtcPrice() {
    setFetchingBtcPrice(true);
    try {
      const res = await api.get<{ ok: boolean; btcUsdPrice: number | null }>(
        '/admin/transparency/btc-usd-price',
      );
      if (res.data.ok && res.data.btcUsdPrice) {
        setBtcUsdPriceInput(String(res.data.btcUsdPrice));
        toast.success(`Cotação BTC atualizada: $${res.data.btcUsdPrice.toLocaleString('en-US')}`);
      } else {
        toast.error('Não foi possível obter a cotação automática. Digite manualmente.');
      }
    } catch {
      toast.error('Erro ao conectar ao oráculo de preços BTC.');
    } finally {
      setFetchingBtcPrice(false);
    }
  }

  // Live calculated USD in form
  const parsedSats = parseInt(satoshiInput.replace(/[^\d]/g, ''), 10) || 0;
  const parsedBtcPrice = parseFloat(btcUsdPriceInput) || 0;
  const calculatedUsd = parsedSats > 0 && parsedBtcPrice > 0 ? (parsedSats / 100_000_000) * parsedBtcPrice : 0;

  async function handleSaveProfitLog() {
    if (!selectedAssetId) return;
    if (parsedSats <= 0) return toast.error('Informe uma quantidade positiva de satoshis.');
    if (parsedBtcPrice <= 0) return toast.error('Informe a cotação BTC/USD.');

    setSavingProfit(true);
    try {
      const payload = {
        satoshiAmount: parsedSats,
        btcUsdPrice: parsedBtcPrice,
        earnedAt: new Date(earnedAtInput).toISOString(),
        notes: notesInput.trim() || null,
      };

      if (editingLogId) {
        await api.put(`/admin/transparency/hardware-assets/${selectedAssetId}/profit-logs/${editingLogId}`, payload);
        toast.success('Lançamento atualizado!');
        setEditingLogId(null);
      } else {
        await api.post(`/admin/transparency/hardware-assets/${selectedAssetId}/profit-logs`, payload);
        toast.success('Lucro lançado com sucesso!');
      }

      setSatoshiInput('');
      setNotesInput('');
      void loadProfitLogs(selectedAssetId);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar lançamento de lucro.');
    } finally {
      setSavingProfit(false);
    }
  }

  function handleStartEditLog(log: HardwareProfitLogRow) {
    setEditingLogId(log.id);
    setSatoshiInput(log.satoshiAmount);
    setBtcUsdPriceInput(String(log.btcUsdPrice));
    setEarnedAtInput(log.earnedAt ? log.earnedAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setNotesInput(log.notes || '');
  }

  function handleCancelEditLog() {
    setEditingLogId(null);
    setSatoshiInput('');
    setNotesInput('');
  }

  async function handleDeleteProfitLog(logId: number) {
    if (!selectedAssetId) return;
    try {
      await api.delete(`/admin/transparency/hardware-assets/${selectedAssetId}/profit-logs/${logId}`);
      toast.success('Lançamento removido.');
      setConfirmDeleteLogId(null);
      void loadProfitLogs(selectedAssetId);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao excluir lançamento.');
    }
  }

  // Asset creation / editing
  function openCreateAsset() {
    setEditingAsset(null);
    setFormAssetName('');
    setFormAssetManufacturer('Bitmain');
    setFormAssetCost('');
    setFormAssetStatus('running');
    setFormAssetDescription('');
    setAssetModalOpen(true);
  }

  function openEditAsset(asset: HardwareAssetRow) {
    setEditingAsset(asset);
    setFormAssetName(asset.name);
    setFormAssetManufacturer(asset.manufacturer || '');
    setFormAssetCost(String(asset.purchaseCostUsd));
    setFormAssetStatus((asset.status as 'running' | 'maintenance' | 'retired') || 'running');
    setFormAssetDescription(asset.description || '');
    setAssetModalOpen(true);
  }

  async function handleSaveAsset() {
    const name = formAssetName.trim();
    if (!name) return toast.error('Informe o nome do equipamento.');
    const cost = parseFloat(formAssetCost);
    if (isNaN(cost) || cost < 0) return toast.error('Informe um custo de aquisição válido.');

    setSavingAsset(true);
    try {
      const payload = {
        name,
        manufacturer: formAssetManufacturer.trim() || null,
        purchaseCostUsd: cost,
        status: formAssetStatus,
        description: formAssetDescription.trim() || null,
        isActive: true,
      };

      if (editingAsset) {
        await api.put(`/admin/transparency/hardware-assets/${editingAsset.id}`, payload);
        toast.success('Equipamento atualizado!');
      } else {
        await api.post('/admin/transparency/hardware-assets', payload);
        toast.success('Equipamento cadastrado com sucesso!');
      }
      setAssetModalOpen(false);
      void loadAssets();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar equipamento.');
    } finally {
      setSavingAsset(false);
    }
  }

  const selectedAsset = assets.find((a) => a.id === selectedAssetId) || assets[0];

  return (
    <div className="space-y-6">
      {/* ── Header e Seleção de Máquina ───────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white">Mineração Física & Parque de ASICs</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Gestão de equipamentos de mineração física e registro dos proventos diários via Lightning.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openCreateAsset}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-primary/20 hover:brightness-110 transition"
          >
            <Plus className="w-4 h-4" />
            Novo Equipamento
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
          Carregando equipamentos...
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-12 text-center text-slate-400 space-y-3">
          <Cpu className="w-10 h-10 mx-auto text-slate-600" />
          <p className="text-sm font-bold">Nenhum equipamento de hardware cadastrado ainda.</p>
          <button
            type="button"
            onClick={openCreateAsset}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-slate-950"
          >
            <Plus className="w-4 h-4" />
            Cadastrar Primeiro ASIC
          </button>
        </div>
      ) : (
        <>
          {/* ── Seletor de Ativo Ativo ──────────────────────────────────── */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {assets.map((asset) => {
              const isSelected = asset.id === selectedAssetId;
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setSelectedAssetId(asset.id)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition whitespace-nowrap ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                      : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  <Cpu className="w-4 h-4" />
                  {asset.name}
                  <span className="text-[10px] text-slate-500">(${Number(asset.purchaseCostUsd).toFixed(0)})</span>
                </button>
              );
            })}
          </div>

          {selectedAsset && (
            <div className="space-y-6">
              {/* ── Card do Equipamento Selecionado & KPIs de ROI ──────── */}
              <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-black text-white">{selectedAsset.name}</h3>
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-400">
                        {selectedAsset.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Fabricante: {selectedAsset.manufacturer || 'Bitmain'} • Custo de Aquisição: $
                      {Number(selectedAsset.purchaseCostUsd).toFixed(2)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditAsset(selectedAsset)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/80 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Editar Dados
                  </button>
                </div>

                {/* Grid de Métricas de Retorno */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Minerado</p>
                    <p className="text-lg font-black text-white mt-0.5">
                      ${profitSummary?.totalEarnedUsd != null ? profitSummary.totalEarnedUsd.toFixed(2) : '0.00'}
                    </p>
                    <p className="text-[10px] text-amber-400 mt-0.5">
                      {profitSummary?.totalEarnedSatoshi || '0'} sats
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recuperado (% ROI)</p>
                    <p className="text-lg font-black text-emerald-300 mt-0.5">
                      {profitSummary?.recoveredPct != null ? profitSummary.recoveredPct.toFixed(1) : '0.0'}%
                    </p>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, profitSummary?.recoveredPct || 0)}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Saldo Restante</p>
                    <p className="text-lg font-black text-slate-200 mt-0.5">
                      ${profitSummary?.remainingUsd != null ? profitSummary.remainingUsd.toFixed(2) : '0.00'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Para amortização 100%</p>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estimativa de ROI</p>
                    <p className="text-lg font-black text-violet-300 mt-0.5">
                      {profitSummary?.roiReached
                        ? 'Alcançado!'
                        : profitSummary?.estimatedDaysToRoi != null
                          ? `~${profitSummary.estimatedDaysToRoi} dias`
                          : 'Calculando...'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {profitSummary?.avgDailyUsd != null ? `Média $${profitSummary.avgDailyUsd.toFixed(2)}/dia` : 'Sem dados'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Formulário: Lançamento Diário de Lucro (Lightning) ──── */}
              <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" />
                    <h4 className="text-sm font-black text-white uppercase tracking-wider">
                      {editingLogId ? 'Editar Lançamento de Lucro' : 'Lançar Provento de Mineração (Lightning)'}
                    </h4>
                  </div>
                  {editingLogId && (
                    <button
                      type="button"
                      onClick={handleCancelEditLog}
                      className="text-xs text-rose-400 hover:underline"
                    >
                      Cancelar Edição
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  {/* Satoshis */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Satoshis Recebidos *
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={satoshiInput}
                      onChange={(e) => setSatoshiInput(e.target.value)}
                      placeholder="Ex: 25000"
                      className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm font-mono text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  {/* Cotação BTC/USD */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Cotação BTC/USD *
                      </label>
                      <button
                        type="button"
                        onClick={handleFetchBtcPrice}
                        disabled={fetchingBtcPrice}
                        className="text-[10px] text-primary hover:underline inline-flex items-center gap-1 font-bold"
                      >
                        {fetchingBtcPrice ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Buscar cotação
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={btcUsdPriceInput}
                      onChange={(e) => setBtcUsdPriceInput(e.target.value)}
                      placeholder="Ex: 98000"
                      className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm font-mono text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                    />
                  </div>

                  {/* Data */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Data do Recebimento
                    </label>
                    <input
                      type="date"
                      value={earnedAtInput}
                      onChange={(e) => setEarnedAtInput(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                    />
                  </div>

                  {/* Valor Calculado & Salvar */}
                  <div className="flex flex-col justify-end">
                    <button
                      type="button"
                      onClick={handleSaveProfitLog}
                      disabled={savingProfit}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-amber-300 transition shadow-lg shadow-amber-400/20 disabled:opacity-50"
                    >
                      {savingProfit ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      {editingLogId ? 'Salvar Lançamento' : 'Registrar Lucro'}
                    </button>
                  </div>
                </div>

                {/* Feedback em tempo real do valor convertido */}
                {calculatedUsd > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 flex items-center justify-between">
                    <span>
                      Conversão calculada: <strong>{parsedSats.toLocaleString()} sats</strong> a $
                      {parsedBtcPrice.toLocaleString()} =
                    </span>
                    <span className="text-sm font-black text-amber-300 font-mono">
                      ≈ ${calculatedUsd.toFixed(2)} USD
                    </span>
                  </div>
                )}
              </div>

              {/* ── Histórico Diário de Lucros ─────────────────────────── */}
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/40">
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Histórico de Lançamentos ({profitLogs.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => loadProfitLogs(selectedAsset.id)}
                    className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                    Atualizar
                  </button>
                </div>

                <table className="min-w-full text-sm">
                  <thead className="bg-slate-950/70 text-[10px] uppercase font-bold text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left">Data</th>
                      <th className="px-4 py-3 text-right">Satoshis</th>
                      <th className="px-4 py-3 text-right">Cotação BTC</th>
                      <th className="px-4 py-3 text-right">Valor USD</th>
                      <th className="px-4 py-3 text-left">Notas</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {loadingLogs ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1" />
                          Carregando histórico...
                        </td>
                      </tr>
                    ) : profitLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Nenhum lucro lançado para este equipamento ainda.
                        </td>
                      </tr>
                    ) : (
                      profitLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-white/[0.02] transition">
                          <td className="px-4 py-3 text-xs text-slate-300 whitespace-nowrap">
                            {new Date(log.earnedAt).toLocaleDateString(undefined, {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-amber-300">
                            {Number(log.satoshiAmount).toLocaleString()} sats
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-slate-400">
                            ${Number(log.btcUsdPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                            ${Number(log.earnedUsd).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400">
                            {log.notes || '—'}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleStartEditLog(log)}
                                className="rounded-lg border border-white/10 bg-slate-800/80 p-1.5 text-slate-300 hover:text-white transition"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteLogId === log.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteProfitLog(log.id)}
                                    className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-600 transition"
                                  >
                                    Sim
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteLogId(null)}
                                    className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-white transition"
                                  >
                                    Não
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteLogId(log.id)}
                                  className="rounded-lg border border-rose-500/20 bg-rose-950/30 p-1.5 text-rose-400 hover:bg-rose-900/50 transition"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modal de Cadastro / Edição de Equipamento ASIC ─────────────── */}
      {assetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-lg font-black text-white">
                {editingAsset ? 'Editar Equipamento' : 'Novo Equipamento ASIC'}
              </h3>
              <button
                type="button"
                onClick={() => setAssetModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Nome do Modelo *
                </label>
                <input
                  type="text"
                  value={formAssetName}
                  onChange={(e) => setFormAssetName(e.target.value)}
                  placeholder="Ex: Antminer S19J Pro 104 TH/s"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Fabricante
                </label>
                <input
                  type="text"
                  value={formAssetManufacturer}
                  onChange={(e) => setFormAssetManufacturer(e.target.value)}
                  placeholder="Bitmain"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Custo de Compra (USD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formAssetCost}
                    onChange={(e) => setFormAssetCost(e.target.value)}
                    placeholder="640.00"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white font-mono focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Status Operacional
                  </label>
                  <select
                    value={formAssetStatus}
                    onChange={(e) =>
                      setFormAssetStatus(e.target.value as 'running' | 'maintenance' | 'retired')
                    }
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  >
                    <option value="running">Operando (Running)</option>
                    <option value="maintenance">Manutenção</option>
                    <option value="retired">Aposentado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Descrição / Especificações
                </label>
                <textarea
                  rows={2}
                  value={formAssetDescription}
                  onChange={(e) => setFormAssetDescription(e.target.value)}
                  placeholder="Observações sobre consumo energético, local de instalação..."
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setAssetModalOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAsset}
                disabled={savingAsset}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black text-slate-950 hover:brightness-110 disabled:opacity-50"
              >
                {savingAsset && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingAsset ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
