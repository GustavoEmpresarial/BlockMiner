import { useEffect, useState, useCallback, useRef } from 'react';
import {
  TrendingUp,
  Plus,
  RefreshCw,
  ExternalLink,
  Edit2,
  Trash2,
  Loader2,
  DollarSign,
  Upload,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type { ExternalInvestmentRow } from './components/adminTransparency.types';

export default function AdminTransparencyExternalInvestmentsPage() {
  const [investments, setInvestments] = useState<ExternalInvestmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExternalInvestmentRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLinkUrl, setFormLinkUrl] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formAmountInvested, setFormAmountInvested] = useState('');
  const [formAmountWithdrawn, setFormAmountWithdrawn] = useState('');
  const [formRoiForecast, setFormRoiForecast] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('0');
  const [formIsActive, setFormIsActive] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok?: boolean; investments?: ExternalInvestmentRow[] }>(
        '/admin/transparency/external-investments',
      );
      if (res.data.ok) {
        setInvestments(res.data.investments || []);
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar investimentos externos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Aggregate Metrics
  const totalInvested = investments.reduce((sum, item) => sum + Number(item.amountInvestedUsd || 0), 0);
  const totalWithdrawn = investments.reduce((sum, item) => sum + Number(item.amountWithdrawnUsd || 0), 0);
  const netBalance = totalWithdrawn - totalInvested;
  const activeCount = investments.filter((i) => i.isActive).length;

  function openCreate() {
    setEditingItem(null);
    setFormName('');
    setFormDescription('');
    setFormLinkUrl('');
    setFormImageUrl('');
    setFormAmountInvested('0');
    setFormAmountWithdrawn('0');
    setFormRoiForecast('');
    setFormSortOrder(String(investments.length));
    setFormIsActive(true);
    setModalOpen(true);
  }

  function openEdit(item: ExternalInvestmentRow) {
    setEditingItem(item);
    setFormName(item.name);
    setFormDescription(item.description || '');
    setFormLinkUrl(item.linkUrl || '');
    setFormImageUrl(item.imageUrl || '');
    setFormAmountInvested(String(item.amountInvestedUsd || 0));
    setFormAmountWithdrawn(String(item.amountWithdrawnUsd || 0));
    setFormRoiForecast(item.roiForecast || '');
    setFormSortOrder(String(item.sortOrder || 0));
    setFormIsActive(item.isActive);
    setModalOpen(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máximo 5 MB).');
      return;
    }
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api.post<{ ok: boolean; url: string }>('/admin/upload-image', fd);
      if (res.data.ok && res.data.url) {
        setFormImageUrl(res.data.url);
        toast.success('Logo enviada com sucesso!');
      } else {
        toast.error('Falha no upload da imagem.');
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro no upload.');
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSave() {
    const name = formName.trim();
    if (!name || name.length < 2) {
      return toast.error('Informe um nome com pelo menos 2 caracteres.');
    }
    const invested = parseFloat(formAmountInvested) || 0;
    const withdrawn = parseFloat(formAmountWithdrawn) || 0;
    if (invested < 0 || withdrawn < 0) {
      return toast.error('Valores financeiros não podem ser negativos.');
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description: formDescription.trim() || null,
        linkUrl: formLinkUrl.trim() || null,
        imageUrl: formImageUrl.trim() || null,
        amountInvestedUsd: invested,
        amountWithdrawnUsd: withdrawn,
        roiForecast: formRoiForecast.trim() || null,
        sortOrder: parseInt(formSortOrder, 10) || 0,
        isActive: formIsActive,
      };

      if (editingItem) {
        await api.put(`/admin/transparency/external-investments/${editingItem.id}`, payload);
        toast.success('Investimento atualizado!');
      } else {
        await api.post('/admin/transparency/external-investments', payload);
        toast.success('Novo investimento cadastrado com sucesso!');
      }
      setModalOpen(false);
      void loadData();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar investimento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(item: ExternalInvestmentRow) {
    try {
      await api.put(`/admin/transparency/external-investments/${item.id}`, { isActive: !item.isActive });
      toast.success(item.isActive ? 'Investimento desativado' : 'Investimento ativado');
      void loadData();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao alterar status.');
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/admin/transparency/external-investments/${id}`);
      toast.success('Investimento excluído!');
      setConfirmDeleteId(null);
      void loadData();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao excluir investimento.');
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Investimentos Externos</h1>
          <p className="text-xs text-slate-400 mt-1">
            Plataformas e projetos de terceiros onde o capital do BlockMiner foi alocado para gerar receita.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-primary/20 hover:brightness-110 transition"
          >
            <Plus className="w-4 h-4" />
            Novo Investimento
          </button>
        </div>
      </div>

      {/* ── KPIs Rápidos ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Investido</p>
            <p className="text-xl font-black text-white mt-1 font-mono">${totalInvested.toFixed(2)}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{investments.length} plataformas registradas</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Total Resgatado</p>
            <p className="text-xl font-black text-emerald-300 mt-1 font-mono">${totalWithdrawn.toFixed(2)}</p>
            <p className="text-[10px] text-emerald-500 mt-0.5">Saques efetuados</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Saldo Líquido</p>
            <p className={`text-xl font-black mt-1 font-mono ${netBalance >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {netBalance >= 0 ? `+$${netBalance.toFixed(2)}` : `-$${Math.abs(netBalance).toFixed(2)}`}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {netBalance >= 0 ? 'Lucro líquido alcançado' : 'Capital em recuperação'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-300">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Plataformas Ativas</p>
            <p className="text-xl font-black text-primary mt-1">{activeCount}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Exibidas no portal público</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── Tabela de Investimentos ───────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/40">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-950/70 text-[10px] uppercase font-bold text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Plataforma</th>
              <th className="px-4 py-3 text-right">Investido</th>
              <th className="px-4 py-3 text-right">Resgatado</th>
              <th className="px-4 py-3 text-center">Recuperação</th>
              <th className="px-4 py-3 text-left">Previsão ROI</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                  Carregando investimentos...
                </td>
              </tr>
            ) : investments.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  Nenhum investimento externo cadastrado ainda.
                </td>
              </tr>
            ) : (
              investments.map((item) => {
                const invested = Number(item.amountInvestedUsd || 0);
                const withdrawn = Number(item.amountWithdrawnUsd || 0);
                const recoveryPct = invested > 0 ? (withdrawn / invested) * 100 : withdrawn > 0 ? 100 : 0;

                return (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-8 h-8 rounded-lg object-contain bg-white/5 p-1 border border-white/10"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400 border border-white/10">
                            <TrendingUp className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2 font-bold text-white text-xs">
                            {item.name}
                            {item.linkUrl && (
                              <a
                                href={item.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-500 hover:text-primary transition"
                                title="Abrir link externo"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 max-w-xs truncate mt-0.5">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-200">
                      ${invested.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                      ${withdrawn.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className="text-xs font-bold text-slate-300 font-mono">
                          {recoveryPct.toFixed(1)}%
                        </span>
                        <div className="w-16 bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              recoveryPct >= 100 ? 'bg-emerald-400' : 'bg-primary'
                            }`}
                            style={{ width: `${Math.min(100, recoveryPct)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.roiForecast ? (
                        <span className="inline-flex items-center rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                          {item.roiForecast}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          item.isActive ? 'bg-primary' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition duration-200 ease-in-out ${
                            item.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="rounded-lg border border-white/10 bg-slate-800/80 p-1.5 text-slate-300 hover:text-white transition"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === item.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
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
                            onClick={() => setConfirmDeleteId(item.id)}
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

      {/* ── Modal de Cadastro / Edição ─────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h2 className="text-lg font-black text-white">
                {editingItem ? 'Editar Investimento Externo' : 'Novo Investimento Externo'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Nome da Plataforma *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: RollerCoin, FaucetPay Stake Pool..."
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Descrição da Estratégia
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Detalhes sobre a estratégia ou tipo de rendimento..."
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Link Oficial / Afiliado (URL segura)
                </label>
                <input
                  type="url"
                  value={formLinkUrl}
                  onChange={(e) => setFormLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Logo / Imagem da Plataforma
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    placeholder="URL da logo ou envie pelo botão"
                    className="flex-1 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:text-white"
                  >
                    {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Valor Investido (USD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formAmountInvested}
                    onChange={(e) => setFormAmountInvested(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Valor Resgatado (USD) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formAmountWithdrawn}
                    onChange={(e) => setFormAmountWithdrawn(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm font-mono text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Previsão / Retorno ROI
                  </label>
                  <input
                    type="text"
                    value={formRoiForecast}
                    onChange={(e) => setFormRoiForecast(e.target.value)}
                    placeholder="Ex: +18% a.a."
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Ordem de Exibição
                  </label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded border-white/10 bg-slate-800 text-primary focus:ring-0 w-4 h-4"
                  />
                  Exibir publicamente no portal de transparência
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black text-slate-950 hover:brightness-110 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingItem ? 'Salvar Alterações' : 'Cadastrar Investimento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
