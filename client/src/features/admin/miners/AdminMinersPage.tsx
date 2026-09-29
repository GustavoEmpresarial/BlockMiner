import { useState, useMemo } from 'react';
import { Loader2, RefreshCw, Search, Plus, Cpu, Store, Zap, Pencil, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminMinersList } from './adminMiners.hooks';
import { adminMinersApi } from './adminMiners.api';
import { AdminBrokenMachinesPanel } from './AdminBrokenMachinesPanel';
import AdminMinerImage from './components/AdminMinerImage';
import { MinerFormModal } from './components/MinerFormModal';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type { AdminMinerListRow } from './adminMiners.types';

function formatHashRate(val: number | string | null | undefined): string {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return '0 H/s';
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TH/s`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GH/s`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MH/s`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)} KH/s`;
  return `${n.toFixed(0)} H/s`;
}

const TIER_BADGES: Record<string, string> = {
  common: 'bg-slate-800 text-slate-300 border-slate-700',
  rare: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  epic: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  legendary: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

export default function AdminMinersPage() {
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'shop'>('all');

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [selectedMiner, setSelectedMiner] = useState<AdminMinerListRow | null>(null);

  const { miners, total, loading, listError, reload } = useAdminMinersList({
    page,
    limit: 100,
    filter: 'all',
    sort: 'name',
    q: appliedQ,
  });

  const stats = useMemo(() => {
    const activeCount = miners.filter((m) => m.isActive).length;
    const shopCount = miners.filter((m) => m.showInShop).length;
    const totalHash = miners.reduce((acc, m) => acc + (Number(m.baseHashRate ?? m.hashRate) || 0), 0);
    const avgHash = miners.length > 0 ? totalHash / miners.length : 0;
    return { activeCount, shopCount, totalHash, avgHash };
  }, [miners]);

  const filteredMiners = useMemo(() => {
    if (statusFilter === 'active') return miners.filter((m) => m.isActive);
    if (statusFilter === 'shop') return miners.filter((m) => m.showInShop);
    return miners;
  }, [miners, statusFilter]);

  const toggleActive = async (id: number | string) => {
    try {
      await adminMinersApi.toggleActive(id);
      toast.success('Status da mineradora atualizado');
      void reload();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao atualizar');
    }
  };

  const toggleStore = async (id: number | string) => {
    try {
      await adminMinersApi.toggleStore(id);
      toast.success('Visibilidade na loja atualizada');
      void reload();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao atualizar');
    }
  };

  const openCreateModal = () => {
    setSelectedMiner(null);
    setFormModalOpen(true);
  };

  const openEditModal = (m: AdminMinerListRow) => {
    setSelectedMiner(m);
    setFormModalOpen(true);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Catálogo de Mineradoras</h1>
          <p className="text-sm text-slate-400 mt-1">
            Gerenciamento completo das máquinas de mineração, preços, tiers e slots de rack.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void reload()}
            className="p-2.5 rounded-xl border border-slate-700 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20 transition"
          >
            <Plus className="h-4 w-4" />
            Nova Mineradora
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Cadastrado</span>
            <Cpu className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-white">{total}</p>
          <p className="text-xs text-slate-500 mt-1">Modelos no banco de dados</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Máquinas Ativas</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">{stats.activeCount}</p>
          <p className="text-xs text-slate-500 mt-1">Disponíveis para mineração</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Disponíveis na Loja</span>
            <Store className="h-4 w-4 text-blue-400" />
          </div>
          <p className="text-2xl font-black text-blue-400">{stats.shopCount}</p>
          <p className="text-xs text-slate-500 mt-1">Listadas para compra (/shop)</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Poder Médio</span>
            <Zap className="h-4 w-4 text-amber-300" />
          </div>
          <p className="text-2xl font-black text-amber-300">{formatHashRate(stats.avgHash)}</p>
          <p className="text-xs text-slate-500 mt-1">Média por máquina do catálogo</p>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-2xl border border-white/5">
        <form
          className="flex-1 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedQ(q);
            setPage(1);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, slug ou tier…"
              className="w-full rounded-xl border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white focus:border-amber-400 focus:outline-none"
            />
          </div>
          <button type="submit" className="rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/30">
            Buscar
          </button>
        </form>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'all'
                ? 'bg-amber-500 text-slate-950'
                : 'text-slate-400 hover:text-white bg-slate-800/40'
            }`}
          >
            Todas ({miners.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'active'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-white bg-slate-800/40'
            }`}
          >
            Ativas ({stats.activeCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('shop')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'shop'
                ? 'bg-blue-500 text-white'
                : 'text-slate-400 hover:text-white bg-slate-800/40'
            }`}
          >
            Na Loja ({stats.shopCount})
          </button>
        </div>
      </div>

      {listError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{listError}</p>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[850px]">
            <thead className="bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/10">
              <tr>
                <th className="px-4 py-3.5 w-16 text-center">Visual</th>
                <th className="px-4 py-3.5">ID / Nome</th>
                <th className="px-4 py-3.5">Potência</th>
                <th className="px-4 py-3.5">Preço</th>
                <th className="px-4 py-3.5">Slots</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Loja</th>
                <th className="px-4 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500 mb-2" />
                    <span className="text-xs">Carregando catálogo de mineradoras...</span>
                  </td>
                </tr>
              ) : filteredMiners.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500">
                    Nenhuma mineradora encontrada para os critérios selecionados.
                  </td>
                </tr>
              ) : (
                filteredMiners.map((m) => {
                  const tierCls = TIER_BADGES[String(m.tier).toLowerCase()] || TIER_BADGES.common;
                  return (
                    <tr key={String(m.id)} className="hover:bg-white/[0.02] transition">
                      <td className="px-4 py-3 text-center">
                        <div className="h-11 w-11 mx-auto rounded-xl bg-slate-950/80 border border-white/10 overflow-hidden flex items-center justify-center p-1">
                          <AdminMinerImage imageUrl={m.imageUrl} variant="table" alt={m.name} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{m.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${tierCls}`}>
                            {m.tier || 'common'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-xs text-slate-500">#{m.id}</span>
                          <span className="font-mono text-xs text-amber-500/80">{m.slug}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-amber-300">
                        {formatHashRate(m.baseHashRate ?? m.hashRate)}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-400">
                        {m.price ? `${m.price} POL` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {m.slotSize ?? 1} slot
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            m.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {m.isActive ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void toggleStore(m.id)}
                          className={`text-xs font-bold px-2 py-0.5 rounded-lg border transition ${
                            m.showInShop
                              ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                              : 'border-slate-700 text-slate-500 hover:bg-slate-800'
                          }`}
                        >
                          {m.showInShop ? 'Visível' : 'Oculto'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleActive(m.id)}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs font-bold text-amber-400 hover:bg-slate-800 transition"
                          >
                            {m.isActive ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Broken Machines & Orphans Diagnosis Panel */}
      <AdminBrokenMachinesPanel />

      {/* Creation and Edit Modal */}
      <MinerFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSaved={() => void reload()}
        miner={selectedMiner}
      />
    </div>
  );
}
