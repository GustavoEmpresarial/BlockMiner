import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  Plus,
  ExternalLink,
  Copy,
  Check,
  Edit2,
  Trash2,
  Loader2,
  ShieldCheck,
  Save,
  Globe,
  DollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../../lib/admin.api';
import type { TrackedWalletRow } from './adminTransparency.types';

export default function TrackedWalletsTab() {
  const [wallets, setWallets] = useState<TrackedWalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  // Singleton wallet setting
  const [mainWallet, setMainWallet] = useState('');
  const [savingMainWallet, setSavingMainWallet] = useState(false);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState<TrackedWalletRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Form
  const [formLabel, setFormLabel] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formChain, setFormChain] = useState('polygon');
  const [formAssetSymbol, setFormAssetSymbol] = useState('POL');
  const [formExplorerBaseUrl, setFormExplorerBaseUrl] = useState('https://polygonscan.com/address');
  const [formManualUsdValue, setFormManualUsdValue] = useState('');
  const [formManualValueNote, setFormManualValueNote] = useState('');
  const [formIncludeInTotals, setFormIncludeInTotals] = useState(true);
  const [formIsPublic, setFormIsPublic] = useState(true);
  const [formIsActive, setFormIsActive] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [walletsRes, settingsRes] = await Promise.all([
        api.get<{ ok: boolean; wallets: TrackedWalletRow[] }>('/admin/transparency/tracked-wallets'),
        api.get<{ ok: boolean; address: string | null }>('/admin/transparency/wallet/settings'),
      ]);
      if (walletsRes.data.ok) setWallets(walletsRes.data.wallets || []);
      if (settingsRes.data.ok && settingsRes.data.address) setMainWallet(settingsRes.data.address);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar carteiras');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSaveMainWallet() {
    setSavingMainWallet(true);
    try {
      const res = await api.put<{ ok: boolean; address: string | null }>('/admin/transparency/wallet/settings', {
        address: mainWallet.trim(),
      });
      if (res.data.ok) {
        toast.success('Endereço da carteira principal atualizado!');
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar carteira principal');
    } finally {
      setSavingMainWallet(false);
    }
  }

  function handleCopy(address: string) {
    void navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
    toast.success('Endereço copiado!');
  }

  function openCreate() {
    setEditingWallet(null);
    setFormLabel('');
    setFormAddress('');
    setFormChain('polygon');
    setFormAssetSymbol('POL');
    setFormExplorerBaseUrl('https://polygonscan.com/address');
    setFormManualUsdValue('');
    setFormManualValueNote('');
    setFormIncludeInTotals(true);
    setFormIsPublic(true);
    setFormIsActive(true);
    setModalOpen(true);
  }

  function openEdit(wallet: TrackedWalletRow) {
    setEditingWallet(wallet);
    setFormLabel(wallet.label);
    setFormAddress(wallet.address);
    setFormChain(wallet.chain || 'polygon');
    setFormAssetSymbol(wallet.assetSymbol || 'POL');
    setFormExplorerBaseUrl(wallet.explorerBaseUrl || 'https://polygonscan.com/address');
    setFormManualUsdValue(wallet.manualUsdValue != null ? String(wallet.manualUsdValue) : '');
    setFormManualValueNote(wallet.manualValueNote || '');
    setFormIncludeInTotals(wallet.includeInTotals);
    setFormIsPublic(wallet.isPublic);
    setFormIsActive(wallet.isActive);
    setModalOpen(true);
  }

  async function handleSaveWallet() {
    const label = formLabel.trim();
    const address = formAddress.trim();
    if (!label) return toast.error('Informe um rótulo para a carteira.');
    if (!address.startsWith('0x') || address.length !== 42) {
      return toast.error('Endereço EVM inválido (deve ter 42 caracteres e iniciar com 0x).');
    }

    const manualVal = formManualUsdValue.trim() ? parseFloat(formManualUsdValue) : null;
    if (manualVal !== null && (isNaN(manualVal) || manualVal < 0)) {
      return toast.error('O valor manual deve ser um número maior ou igual a zero.');
    }

    setSaving(true);
    try {
      const payload = {
        label,
        address,
        chain: formChain.trim() || 'polygon',
        assetSymbol: formAssetSymbol.trim() || 'POL',
        explorerBaseUrl: formExplorerBaseUrl.trim() || 'https://polygonscan.com/address',
        manualUsdValue: manualVal,
        manualValueNote: formManualValueNote.trim() || null,
        includeInTotals: formIncludeInTotals,
        isPublic: formIsPublic,
        isActive: formIsActive,
      };

      if (editingWallet) {
        await api.put(`/admin/transparency/tracked-wallets/${editingWallet.id}`, payload);
        toast.success('Carteira atualizada com sucesso!');
      } else {
        await api.post('/admin/transparency/tracked-wallets', payload);
        toast.success('Nova carteira adicionada!');
      }
      setModalOpen(false);
      void loadData();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar carteira.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/admin/transparency/tracked-wallets/${id}`);
      toast.success('Carteira removida com sucesso!');
      setConfirmDeleteId(null);
      void loadData();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao remover carteira.');
    }
  }

  async function handleToggleActive(wallet: TrackedWalletRow) {
    try {
      await api.put(`/admin/transparency/tracked-wallets/${wallet.id}`, { isActive: !wallet.isActive });
      toast.success(wallet.isActive ? 'Carteira desativada' : 'Carteira ativada');
      void loadData();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao alterar status.');
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Carteira Principal (Saques / On-Chain) ────────────────────── */}
      <div className="rounded-2xl border border-violet-500/20 bg-violet-950/20 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-violet-400" />
          <h2 className="text-sm font-black text-white uppercase tracking-wider">
            Carteira Polygon Principal (Auditoria & Saques)
          </h2>
        </div>
        <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
          Este endereço é utilizado no portal público para exibir o total consolidado de saques efetuados pela
          plataforma via blockchain Polygon.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={mainWallet}
            onChange={(e) => setMainWallet(e.target.value)}
            placeholder="0x..."
            className="flex-1 min-w-[280px] rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-xs font-mono text-white focus:border-violet-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSaveMainWallet}
            disabled={savingMainWallet}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-500 transition disabled:opacity-50"
          >
            {savingMainWallet ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Carteira
          </button>
        </div>
      </div>

      {/* ── Header das Carteiras Rastreadas ──────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white">Carteiras da Tesouraria Rastreadas</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Carteiras monitoradas com sincronização de saldos multi-chain e auditoria pública.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-primary/20 hover:brightness-110 transition"
        >
          <Plus className="w-4 h-4" />
          Adicionar Carteira
        </button>
      </div>

      {/* ── Tabela de Carteiras ───────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/40">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-950/70 text-[10px] uppercase font-bold text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Rótulo</th>
              <th className="px-4 py-3 text-left">Endereço EVM</th>
              <th className="px-4 py-3 text-left">Rede</th>
              <th className="px-4 py-3 text-right">Saldo Manual (USD)</th>
              <th className="px-4 py-3 text-center">Tesouraria</th>
              <th className="px-4 py-3 text-center">Pública</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Carregando carteiras...
                </td>
              </tr>
            ) : wallets.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  Nenhuma carteira rastreada cadastrada.
                </td>
              </tr>
            ) : (
              wallets.map((w) => {
                const isCopied = copiedAddress === w.address;
                const explorerLink = `${w.explorerBaseUrl || 'https://polygonscan.com/address'}/${w.address}`;

                return (
                  <tr key={w.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-violet-400 shrink-0" />
                        <div>
                          <p className="font-bold text-white text-xs">{w.label}</p>
                          {w.manualValueNote && (
                            <p className="text-[10px] text-slate-500 mt-0.5">{w.manualValueNote}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-2 font-mono text-xs text-slate-300">
                        <span>
                          {w.address.slice(0, 8)}...{w.address.slice(-6)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(w.address)}
                          className="text-slate-500 hover:text-white transition"
                          title="Copiar endereço"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <a
                          href={explorerLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-500 hover:text-primary transition"
                          title="Ver no Explorer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300 uppercase">
                        {w.chain} ({w.assetSymbol})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {w.manualUsdValue != null ? (
                        <span className="text-emerald-400">${Number(w.manualUsdValue).toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-500 text-xs italic">Sync on-chain</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {w.includeInTotals ? (
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                          Sim
                        </span>
                      ) : (
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          Não
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {w.isPublic ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-primary font-bold">
                          <Globe className="w-3 h-3" />
                          Pública
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-bold">Oculta</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(w)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          w.isActive ? 'bg-primary' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition duration-200 ease-in-out ${
                            w.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(w)}
                          className="rounded-lg border border-white/10 bg-slate-800/80 p-1.5 text-slate-300 hover:text-white transition"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === w.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(w.id)}
                              className="rounded-lg bg-rose-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-600 transition"
                            >
                              Sim
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-white transition"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(w.id)}
                            className="rounded-lg border border-rose-500/20 bg-rose-950/30 p-1.5 text-rose-400 hover:bg-rose-900/50 transition"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal de Cadastro / Edição de Carteira ──────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h2 className="text-lg font-black text-white">
                {editingWallet ? 'Editar Carteira Rastreada' : 'Adicionar Carteira à Tesouraria'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Rótulo / Nome da Carteira *
                </label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="Ex: Tesouraria Reserva POL #2"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Endereço EVM (0x...) *
                </label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="0x0000000000000000000000000000000000000000"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Rede (Chain)
                  </label>
                  <input
                    type="text"
                    value={formChain}
                    onChange={(e) => setFormChain(e.target.value)}
                    placeholder="polygon"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Símbolo do Ativo
                  </label>
                  <input
                    type="text"
                    value={formAssetSymbol}
                    onChange={(e) => setFormAssetSymbol(e.target.value)}
                    placeholder="POL"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  URL Base do Explorer
                </label>
                <input
                  type="url"
                  value={formExplorerBaseUrl}
                  onChange={(e) => setFormExplorerBaseUrl(e.target.value)}
                  placeholder="https://polygonscan.com/address"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Valor Fixo Manual USD (Opcional)
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formManualUsdValue}
                      onChange={(e) => setFormManualUsdValue(e.target.value)}
                      placeholder="Deixe vazio p/ on-chain"
                      className="w-full rounded-xl border border-white/10 bg-slate-800 py-2 pl-9 pr-3 text-xs text-white font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Nota do Valor Fixo
                  </label>
                  <input
                    type="text"
                    value={formManualValueNote}
                    onChange={(e) => setFormManualValueNote(e.target.value)}
                    placeholder="Ex: Reserva em cold storage"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                  <input
                    type="checkbox"
                    checked={formIncludeInTotals}
                    onChange={(e) => setFormIncludeInTotals(e.target.checked)}
                    className="rounded border-white/10 bg-slate-800 text-primary focus:ring-0 w-4 h-4"
                  />
                  Incluir no total consolidado da tesouraria do projeto
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                  <input
                    type="checkbox"
                    checked={formIsPublic}
                    onChange={(e) => setFormIsPublic(e.target.checked)}
                    className="rounded border-white/10 bg-slate-800 text-primary focus:ring-0 w-4 h-4"
                  />
                  Visível publicamente no portal de transparência
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded border-white/10 bg-slate-800 text-primary focus:ring-0 w-4 h-4"
                  />
                  Carteira Ativa
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveWallet}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black text-slate-950 hover:brightness-110 transition disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingWallet ? 'Salvar Alterações' : 'Adicionar Carteira'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
