import { useState, useRef } from 'react';
import {
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Trash2,
  CheckCircle2,
  Clock,
  Upload,
  Loader2,
  Receipt,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../../lib/admin.api';
import type { TransparencyEntryRow, TransparencyPeriod, TransparencyType } from './adminTransparency.types';

const EXPENSE_CATEGORIES = [
  { value: 'infrastructure', label: 'Infraestrutura (Servidores, VPS)' },
  { value: 'tooling', label: 'Ferramentas & Licenças (SaaS, APIs)' },
  { value: 'marketing', label: 'Marketing & Tráfego' },
  { value: 'payroll', label: 'Equipe & Desenvolvimento' },
  { value: 'legal', label: 'Jurídico & Contabilidade' },
  { value: 'misc', label: 'Diversos / Outros' },
];

const INCOME_CATEGORIES = [
  { value: 'sponsorship', label: 'Patrocínio / Banners' },
  { value: 'donation', label: 'Doação da Comunidade' },
  { value: 'revenue', label: 'Receita Operacional' },
  { value: 'investment_return', label: 'Retorno de Investimento' },
  { value: 'other', label: 'Outras Entradas' },
];

const PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensal',
  annual: 'Anual',
  one_time: 'Custo Único',
  daily: 'Diário',
};

type Props = {
  entries: TransparencyEntryRow[];
  loading: boolean;
  onRefresh: () => void;
};

export default function TransparencyEntriesTab({ entries, loading, onRefresh }: Props) {
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TransparencyEntryRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form state
  const [formType, setFormType] = useState<TransparencyType>('expense');
  const [formCategory, setFormCategory] = useState('infrastructure');
  const [formIncomeCategory, setFormIncomeCategory] = useState('revenue');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formProvider, setFormProvider] = useState('');
  const [formProviderUrl, setFormProviderUrl] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formAmountUsd, setFormAmountUsd] = useState('');
  const [formPeriod, setFormPeriod] = useState<TransparencyPeriod>('monthly');
  const [formIsPaid, setFormIsPaid] = useState(true);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formNotes, setFormNotes] = useState('');

  // Metrics
  const expenses = entries.filter((e) => !e.type || e.type === 'expense');
  const incomes = entries.filter((e) => e.type === 'income');

  const totalMonthlyExpense = expenses
    .filter((e) => e.period === 'monthly')
    .reduce((sum, e) => sum + Number(e.amountUsd || 0), 0);

  const totalMonthlyIncome = incomes
    .filter((e) => e.period === 'monthly')
    .reduce((sum, e) => sum + Number(e.amountUsd || 0), 0);

  const netBalance = totalMonthlyIncome - totalMonthlyExpense;

  // Filtered rows
  const filtered = entries.filter((e) => {
    if (filterType !== 'all' && (e.type || 'expense') !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = e.name.toLowerCase().includes(q);
      const matchProvider = (e.provider || '').toLowerCase().includes(q);
      const matchCat = e.category.toLowerCase().includes(q);
      if (!matchName && !matchProvider && !matchCat) return false;
    }
    return true;
  });

  function openCreate() {
    setEditingEntry(null);
    setFormType('expense');
    setFormCategory('infrastructure');
    setFormIncomeCategory('revenue');
    setFormName('');
    setFormDescription('');
    setFormProvider('');
    setFormProviderUrl('');
    setFormImageUrl('');
    setFormAmountUsd('');
    setFormPeriod('monthly');
    setFormIsPaid(true);
    setFormIsActive(true);
    setFormNotes('');
    setModalOpen(true);
  }

  function openEdit(entry: TransparencyEntryRow) {
    setEditingEntry(entry);
    setFormType(entry.type || 'expense');
    setFormCategory(entry.category || 'infrastructure');
    setFormIncomeCategory(entry.incomeCategory || 'revenue');
    setFormName(entry.name);
    setFormDescription(entry.description || '');
    setFormProvider(entry.provider || '');
    setFormProviderUrl(entry.providerUrl || '');
    setFormImageUrl(entry.imageUrl || '');
    setFormAmountUsd(String(entry.amountUsd || ''));
    setFormPeriod((entry.period as TransparencyPeriod) || 'monthly');
    setFormIsPaid(entry.isPaid);
    setFormIsActive(entry.isActive);
    setFormNotes(entry.notes || '');
    setModalOpen(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. O limite máximo é 5 MB.');
      return;
    }
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api.post<{ ok: boolean; url: string }>('/admin/upload-image', fd);
      if (res.data.ok && res.data.url) {
        setFormImageUrl(res.data.url);
        toast.success('Imagem enviada com sucesso!');
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
      toast.error('Informe um nome válido (mínimo 2 caracteres).');
      return;
    }
    const amount = parseFloat(formAmountUsd);
    if (isNaN(amount) || amount < 0) {
      toast.error('Informe um valor em USD válido (maior ou igual a zero).');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: formType,
        category: formType === 'expense' ? formCategory : 'misc',
        incomeCategory: formType === 'income' ? formIncomeCategory : null,
        name,
        description: formDescription.trim() || null,
        provider: formProvider.trim() || null,
        providerUrl: formProviderUrl.trim() || null,
        imageUrl: formImageUrl.trim() || null,
        amountUsd: amount,
        period: formPeriod,
        isPaid: formIsPaid,
        isActive: formIsActive,
        notes: formNotes.trim() || null,
      };

      if (editingEntry) {
        await api.put(`/admin/transparency/${editingEntry.id}`, payload);
        toast.success('Entrada atualizada com sucesso!');
      } else {
        await api.post('/admin/transparency', payload);
        toast.success('Nova entrada cadastrada!');
      }
      setModalOpen(false);
      onRefresh();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar entrada.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(entry: TransparencyEntryRow) {
    try {
      await api.put(`/admin/transparency/${entry.id}`, { isActive: !entry.isActive });
      toast.success(entry.isActive ? 'Entrada desativada' : 'Entrada ativada');
      onRefresh();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao alterar status.');
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/admin/transparency/${id}`);
      toast.success('Entrada removida com sucesso!');
      setConfirmDeleteId(null);
      onRefresh();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao deletar entrada.');
    }
  }

  return (
    <div className="space-y-6">
      {/* ── KPIs Rápidos ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-rose-500/20 bg-rose-950/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-300">Despesas Mensais</p>
            <p className="text-2xl font-black text-rose-200 mt-1">${totalMonthlyExpense.toFixed(2)}</p>
            <p className="text-[10px] text-rose-400/80 mt-0.5">{expenses.length} itens cadastrados</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">Receitas Mensais</p>
            <p className="text-2xl font-black text-emerald-200 mt-1">${totalMonthlyIncome.toFixed(2)}</p>
            <p className="text-[10px] text-emerald-400/80 mt-0.5">{incomes.length} itens cadastrados</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Balanço Líquido (Mês)</p>
            <p className={`text-2xl font-black mt-1 ${netBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {netBalance >= 0 ? `+$${netBalance.toFixed(2)}` : `-$${Math.abs(netBalance).toFixed(2)}`}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Resultado operacional mensal</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-300">
            <Receipt className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── Controles de Filtro & Ação ────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-slate-900/80 p-1">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                filterType === 'all' ? 'bg-primary text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({entries.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('expense')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                filterType === 'expense' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Despesas ({expenses.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('income')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                filterType === 'income' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              Receitas ({incomes.length})
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, provedor..."
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-slate-950 shadow-lg shadow-primary/20 hover:brightness-110 transition"
        >
          <Plus className="w-4 h-4" />
          Nova Entrada
        </button>
      </div>

      {/* ── Tabela de Entradas ─────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/40">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-950/70 text-[10px] uppercase font-bold text-slate-400">
            <tr>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-left">Nome / Provedor</th>
              <th className="px-4 py-3 text-left">Categoria</th>
              <th className="px-4 py-3 text-right">Valor USD</th>
              <th className="px-4 py-3 text-left">Período</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Ativo</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Carregando entradas...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  Nenhuma entrada encontrada.
                </td>
              </tr>
            ) : (
              filtered.map((e) => {
                const isExpense = (e.type || 'expense') === 'expense';
                return (
                  <tr key={e.id} className="hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isExpense ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/20">
                          Despesa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                          Receita
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-white flex items-center gap-2">
                        {e.name}
                        {e.providerUrl && (
                          <a
                            href={e.providerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-500 hover:text-primary"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      {e.provider && <p className="text-[11px] text-slate-400 mt-0.5">{e.provider}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">
                      {isExpense
                        ? EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label.split(' ')[0] || e.category
                        : INCOME_CATEGORIES.find((c) => c.value === e.incomeCategory)?.label.split(' ')[0] ||
                          e.incomeCategory ||
                          'Receita'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={isExpense ? 'text-rose-300' : 'text-emerald-300'}>
                        ${Number(e.amountUsd).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {PERIOD_LABELS[e.period] || e.period}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.isPaid ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Pago
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-bold">
                          <Clock className="w-3.5 h-3.5" />
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(e)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          e.isActive ? 'bg-primary' : 'bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition duration-200 ease-in-out ${
                            e.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(e)}
                          className="rounded-lg border border-white/10 bg-slate-800/80 p-1.5 text-slate-300 hover:text-white hover:border-white/20 transition"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === e.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(e.id)}
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
                            onClick={() => setConfirmDeleteId(e.id)}
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

      {/* ── Modal de Criação / Edição ──────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h2 className="text-lg font-black text-white">
                {editingEntry ? 'Editar Entrada de Transparência' : 'Nova Entrada de Transparência'}
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
              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Tipo de Registro
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormType('expense')}
                    className={`rounded-xl border p-3 text-center text-xs font-black transition ${
                      formType === 'expense'
                        ? 'border-rose-500 bg-rose-950/40 text-rose-300'
                        : 'border-white/10 bg-slate-800/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    Despesa (Custo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('income')}
                    className={`rounded-xl border p-3 text-center text-xs font-black transition ${
                      formType === 'income'
                        ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                        : 'border-white/10 bg-slate-800/50 text-slate-400 hover:text-white'
                    }`}
                  >
                    Receita (Entrada)
                  </button>
                </div>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Categoria
                </label>
                {formType === 'expense' ? (
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={formIncomeCategory}
                    onChange={(e) => setFormIncomeCategory(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  >
                    {INCOME_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Nome do Item / Serviço *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Servidor Dedicado Hetzner AX52"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                />
              </div>

              {/* Provedor e URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Provedor / Empresa
                  </label>
                  <input
                    type="text"
                    value={formProvider}
                    onChange={(e) => setFormProvider(e.target.value)}
                    placeholder="Ex: Hetzner Online GmbH"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    URL do Provedor
                  </label>
                  <input
                    type="url"
                    value={formProviderUrl}
                    onChange={(e) => setFormProviderUrl(e.target.value)}
                    placeholder="https://hetzner.com"
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Valor e Período */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Valor em USD *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formAmountUsd}
                      onChange={(e) => setFormAmountUsd(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-white/10 bg-slate-800 py-2 pl-7 pr-3 text-sm text-white font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Recorrência / Período
                  </label>
                  <select
                    value={formPeriod}
                    onChange={(e) => setFormPeriod(e.target.value as TransparencyPeriod)}
                    className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                  >
                    <option value="monthly">Mensal</option>
                    <option value="annual">Anual</option>
                    <option value="one_time">Custo Único</option>
                    <option value="daily">Diário</option>
                  </select>
                </div>
              </div>

              {/* Imagem / Comprovante */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Comprovante / Logo
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formImageUrl}
                    onChange={(e) => setFormImageUrl(e.target.value)}
                    placeholder="URL da imagem ou faça o upload ao lado"
                    className="flex-1 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:text-white hover:bg-slate-700 transition"
                  >
                    {uploadingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload
                  </button>
                </div>
              </div>

              {/* Switches: Pago e Ativo */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                  <input
                    type="checkbox"
                    checked={formIsPaid}
                    onChange={(e) => setFormIsPaid(e.target.checked)}
                    className="rounded border-white/10 bg-slate-800 text-primary focus:ring-0 w-4 h-4"
                  />
                  Pago / Liquidado
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="rounded border-white/10 bg-slate-800 text-primary focus:ring-0 w-4 h-4"
                  />
                  Visível no Portal Público
                </label>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Notas / Observações Internas
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Informações adicionais para auditoria..."
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none"
                />
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
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black text-slate-950 hover:brightness-110 transition disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingEntry ? 'Salvar Alterações' : 'Criar Registro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
