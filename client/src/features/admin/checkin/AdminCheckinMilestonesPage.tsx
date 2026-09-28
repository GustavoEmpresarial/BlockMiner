import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  Coins,
  Cpu,
  Edit2,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';
import {
  createAdminCheckinMilestone,
  deleteAdminCheckinMilestone,
  listAdminCheckinMilestones,
  listAdminCheckinStreakAnomalies,
  updateAdminCheckinMilestone,
} from '../lib/admin.api';
import type {
  AdminCheckinMilestone,
  AdminCheckinMilestoneInput,
  AdminStreakAnomaly,
  CatalogMinerOption,
} from './adminCheckinMilestones.types';

type RewardFilter = 'all' | 'active' | 'inactive' | 'pol' | 'machine' | 'temporary_power';

export default function AdminCheckinMilestonesPage() {
  const [milestones, setMilestones] = useState<AdminCheckinMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RewardFilter>('all');
  const [search, setSearch] = useState('');

  // Anomaly scanner
  const [anomalies, setAnomalies] = useState<AdminStreakAnomaly[]>([]);
  const [loadingAnomalies, setLoadingAnomalies] = useState(false);
  const [showAnomaliesModal, setShowAnomaliesModal] = useState(false);

  // Catalog miners for machine selector
  const [catalogMiners, setCatalogMiners] = useState<CatalogMinerOption[]>([]);
  const [loadingMiners, setLoadingMiners] = useState(false);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<AdminCheckinMilestone | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formDayThreshold, setFormDayThreshold] = useState<number>(7);
  const [formRewardType, setFormRewardType] = useState<'pol' | 'temporary_power' | 'machine'>('pol');
  const [formRewardValue, setFormRewardValue] = useState<number>(1);
  const [formDurationHours, setFormDurationHours] = useState<number>(24);
  const [formMinerId, setFormMinerId] = useState<number | null>(null);
  const [formSortOrder, setFormSortOrder] = useState<number>(0);
  const [formActive, setFormActive] = useState<boolean>(true);

  // Delete modal
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load milestones
  const loadMilestones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAdminCheckinMilestones();
      if (res.data.ok && Array.isArray(res.data.milestones)) {
        setMilestones(res.data.milestones);
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar marcos de check-in');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load catalog miners for machine reward picker
  const loadCatalogMiners = useCallback(async () => {
    setLoadingMiners(true);
    try {
      const res = await api.get<{ ok: boolean; miners?: CatalogMinerOption[] }>('/admin/miners');
      if (res.data.ok && Array.isArray(res.data.miners)) {
        setCatalogMiners(res.data.miners);
      }
    } catch {
      // Non-critical: if miners catalog route is unavailable, manual ID entry remains
    } finally {
      setLoadingMiners(false);
    }
  }, []);

  // Scan streak anomalies
  const scanAnomalies = useCallback(async () => {
    setLoadingAnomalies(true);
    try {
      const res = await listAdminCheckinStreakAnomalies();
      if (res.data.ok && Array.isArray(res.data.anomalies)) {
        setAnomalies(res.data.anomalies);
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao verificar anomalias');
    } finally {
      setLoadingAnomalies(false);
    }
  }, []);

  useEffect(() => {
    void loadMilestones();
    void loadCatalogMiners();
    void scanAnomalies();
  }, [loadMilestones, loadCatalogMiners, scanAnomalies]);

  // Open modal for create
  const openCreateModal = () => {
    setEditingMilestone(null);
    setFormDayThreshold(nextSuggestedDayThreshold);
    setFormRewardType('pol');
    setFormRewardValue(1);
    setFormDurationHours(24);
    setFormMinerId(null);
    setFormSortOrder(0);
    setFormActive(true);
    setModalOpen(true);
  };

  // Open modal for edit
  const openEditModal = (m: AdminCheckinMilestone) => {
    setEditingMilestone(m);
    setFormDayThreshold(m.dayThreshold);
    const rt = m.rewardType === 'temporary_power' || m.rewardType === 'machine' ? m.rewardType : 'pol';
    setFormRewardType(rt);
    setFormRewardValue(m.rewardValue);
    const hours = m.metadataJson?.durationHours ?? (m.validityDays ? m.validityDays * 24 : 24);
    setFormDurationHours(hours);
    setFormMinerId(m.minerId);
    setFormSortOrder(m.sortOrder);
    setFormActive(m.active);
    setModalOpen(true);
  };

  // Quick toggle active
  const handleToggleActive = async (m: AdminCheckinMilestone) => {
    const prev = milestones;
    setMilestones((list) => list.map((item) => (item.id === m.id ? { ...item, active: !item.active } : item)));
    try {
      await updateAdminCheckinMilestone(m.id, { active: !m.active });
      toast.success(!m.active ? 'Marco ativado' : 'Marco desativado');
    } catch (err) {
      setMilestones(prev);
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao atualizar marco');
    }
  };

  // Save (Create or Update)
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (formDayThreshold < 1) {
      toast.error('O dia do marco deve ser no mínimo 1.');
      return;
    }
    if (formRewardType === 'pol' && formRewardValue <= 0) {
      toast.error('O valor da recompensa em POL deve ser maior que zero.');
      return;
    }
    if (formRewardType === 'temporary_power' && (formRewardValue <= 0 || formDurationHours <= 0)) {
      toast.error('Poder temporário requer quantidade de H/s e duração em horas maiores que zero.');
      return;
    }
    if (formRewardType === 'machine' && (!formMinerId || formMinerId < 1)) {
      toast.error('Recompensa de máquina exige a seleção de uma mineradora do catálogo.');
      return;
    }

    setSaving(true);
    try {
      const payload: AdminCheckinMilestoneInput = {
        dayThreshold: formDayThreshold,
        rewardType: formRewardType,
        rewardValue: formRewardType === 'machine' ? 0 : formRewardValue,
        validityDays: formRewardType === 'temporary_power' ? Math.max(1, Math.ceil(formDurationHours / 24)) : 1,
        durationHours: formRewardType === 'temporary_power' ? formDurationHours : undefined,
        minerId: formRewardType === 'machine' ? formMinerId : null,
        active: formActive,
        sortOrder: formSortOrder,
      };

      if (editingMilestone) {
        await updateAdminCheckinMilestone(editingMilestone.id, payload);
        toast.success('Marco atualizado com sucesso!');
      } else {
        await createAdminCheckinMilestone(payload);
        toast.success('Marco criado com sucesso!');
      }
      setModalOpen(false);
      void loadMilestones();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar marco');
    } finally {
      setSaving(false);
    }
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (deleteConfirmId === null) return;
    setDeleting(true);
    try {
      await deleteAdminCheckinMilestone(deleteConfirmId);
      toast.success('Marco removido com sucesso!');
      setDeleteConfirmId(null);
      void loadMilestones();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao excluir marco');
    } finally {
      setDeleting(false);
    }
  };

  // Metrics summary
  const totalCount = milestones.length;
  const activeCount = milestones.filter((m) => m.active).length;
  const polMilestones = milestones.filter((m) => m.rewardType === 'pol');
  const totalPolRewards = polMilestones.reduce((acc, m) => acc + (m.active ? m.rewardValue : 0), 0);
  const machineMilestones = milestones.filter((m) => m.rewardType === 'machine');
  const tempPowerMilestones = milestones.filter((m) => m.rewardType === 'temporary_power');

  // Next suggested threshold
  const nextSuggestedDayThreshold = useMemo(() => {
    if (!milestones.length) return 7;
    const maxDay = Math.max(...milestones.map((m) => m.dayThreshold));
    return maxDay >= 30 ? maxDay + 30 : maxDay + 7;
  }, [milestones]);

  // Filtered milestones
  const filteredMilestones = useMemo(() => {
    return milestones
      .filter((m) => {
        if (filter === 'active') return m.active;
        if (filter === 'inactive') return !m.active;
        if (filter === 'pol') return m.rewardType === 'pol';
        if (filter === 'machine') return m.rewardType === 'machine';
        if (filter === 'temporary_power') return m.rewardType === 'temporary_power';
        return true;
      })
      .filter((m) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          String(m.dayThreshold).includes(q) ||
          m.rewardType.toLowerCase().includes(q) ||
          (m.minerName ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.dayThreshold - b.dayThreshold);
  }, [milestones, filter, search]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <Award className="h-7 w-7 text-amber-400" />
            Marcos de Check-in
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configuração de recompensas por streak diário contínuo e diagnóstico de anomalias
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              void scanAnomalies();
              setShowAnomaliesModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
            Anomalias ({anomalies.length})
          </button>

          <button
            type="button"
            onClick={() => void loadMilestones()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
          >
            <Plus className="h-4 w-4 stroke-[3]" />
            Novo Marco
          </button>
        </div>
      </header>

      {/* Metrics Cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total de Marcos</span>
            <Calendar className="h-4 w-4 text-sky-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-white">{totalCount}</p>
          <span className="text-[10px] text-slate-500">{activeCount} ativos no momento</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Marcos Ativos</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-400">{activeCount}</p>
          <span className="text-[10px] text-slate-500">{totalCount - activeCount} inativos</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Recompensas POL</span>
            <Coins className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-amber-300">{totalPolRewards.toFixed(2)} POL</p>
          <span className="text-[10px] text-slate-500">{polMilestones.length} marcos com saldo</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Máquinas</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-cyan-300">{machineMilestones.length}</p>
          <span className="text-[10px] text-slate-500">prêmios de hardware</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Poder Temporário</span>
            <Zap className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-2xl font-black text-purple-300">{tempPowerMilestones.length}</p>
          <span className="text-[10px] text-slate-500">bônus de hashrate</span>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
          {(
            [
              { key: 'all', label: 'Todos' },
              { key: 'active', label: 'Ativos' },
              { key: 'inactive', label: 'Inativos' },
              { key: 'pol', label: 'POL' },
              { key: 'machine', label: 'Máquinas' },
              { key: 'temporary_power', label: 'Poder' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                filter === item.key
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por dia ou máquina..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>
      </section>

      {/* Milestones Table */}
      <section className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <span className="text-xs">Carregando marcos de check-in...</span>
          </div>
        ) : filteredMilestones.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-12 text-center">
            <Award className="mx-auto h-12 w-12 text-slate-600 mb-3" />
            <h3 className="text-base font-bold text-white">Nenhum marco encontrado</h3>
            <p className="mt-1 text-xs text-slate-500">
              {search || filter !== 'all' ? 'Tente ajustar os filtros de busca.' : 'Crie seu primeiro marco de streak para recompensar jogadores.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Dia de Streak</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Recompensa</th>
                  <th className="px-4 py-3 font-semibold">Ordem</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredMilestones.map((m) => {
                  const isPol = m.rewardType === 'pol';
                  const isMachine = m.rewardType === 'machine';
                  const isPower = m.rewardType === 'temporary_power';
                  const durationHours = m.metadataJson?.durationHours ?? (m.validityDays ? m.validityDays * 24 : 24);

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-xs font-black text-amber-300">
                          <Calendar className="h-3 w-3" />
                          Dia {m.dayThreshold}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {isPol ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                            <Coins className="h-3 w-3" /> POL
                          </span>
                        ) : isMachine ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-cyan-400">
                            <Cpu className="h-3 w-3" /> Máquina
                          </span>
                        ) : isPower ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-400">
                            <Zap className="h-3 w-3" /> Poder Temp.
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                            {m.rewardType}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-semibold text-white">
                        {isPol ? (
                          <span>{m.rewardValue} POL</span>
                        ) : isMachine ? (
                          <div className="flex items-center gap-2">
                            {m.minerImageUrl ? (
                              <img
                                src={m.minerImageUrl}
                                alt={m.minerName ?? 'Máquina'}
                                className="h-6 w-6 rounded object-contain bg-slate-950 border border-slate-800"
                              />
                            ) : null}
                            <span>{m.minerName ?? `Miner ID: ${m.minerId}`}</span>
                            {m.minerBaseHashRate ? (
                              <span className="text-[10px] font-black text-cyan-400">
                                (+{m.minerBaseHashRate} H/s)
                              </span>
                            ) : null}
                          </div>
                        ) : isPower ? (
                          <span>
                            +{m.rewardValue} H/s por {durationHours}h{' '}
                            <span className="text-[10px] text-slate-500">({m.validityDays}d)</span>
                          </span>
                        ) : (
                          <span>{m.rewardValue}</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-mono text-slate-400">{m.sortOrder}</td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(m)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition-colors ${
                            m.active
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              : 'border-slate-600/30 bg-slate-700/20 text-slate-400 hover:bg-slate-700/30'
                          }`}
                        >
                          {m.active ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                          {m.active ? 'Ativo' : 'Inativo'}
                        </button>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                            title="Editar marco"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(m.id)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                            title="Excluir marco"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal: Create / Edit Milestone */}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-400" />
                {editingMilestone ? 'Editar Marco de Check-in' : 'Novo Marco de Check-in'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-400">Dia de Streak Contínuo</span>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={formDayThreshold}
                    onChange={(e) => setFormDayThreshold(Number(e.target.value))}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Ex: 7, 14, 30, 60, 100 dias</span>
                </label>

                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-400">Tipo de Recompensa</span>
                  <select
                    value={formRewardType}
                    onChange={(e) => setFormRewardType(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="pol">Saldo POL</option>
                    <option value="temporary_power">Poder Temporário (H/s)</option>
                    <option value="machine">Máquina do Catálogo</option>
                  </select>
                </label>
              </div>

              {/* Conditional Fields based on rewardType */}
              {formRewardType === 'pol' ? (
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-400">Valor em POL</span>
                  <input
                    type="number"
                    step="0.001"
                    min={0.001}
                    value={formRewardValue}
                    onChange={(e) => setFormRewardValue(Number(e.target.value))}
                    required
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500">Creditado no Reward Inbox após atingir o streak</span>
                </label>
              ) : null}

              {formRewardType === 'temporary_power' ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 block">
                    <span className="font-semibold text-slate-400">Quantidade de Hashrate (H/s)</span>
                    <input
                      type="number"
                      min={1}
                      value={formRewardValue}
                      onChange={(e) => setFormRewardValue(Number(e.target.value))}
                      required
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <span className="font-semibold text-slate-400">Duração (Horas)</span>
                    <input
                      type="number"
                      min={1}
                      max={8760}
                      value={formDurationHours}
                      onChange={(e) => setFormDurationHours(Number(e.target.value))}
                      required
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                    <div className="flex gap-1 pt-1">
                      {[24, 72, 168].map((h) => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setFormDurationHours(h)}
                          className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 hover:text-white"
                        >
                          {h}h ({h / 24}d)
                        </button>
                      ))}
                    </div>
                  </label>
                </div>
              ) : null}

              {formRewardType === 'machine' ? (
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-400">Mineradora do Catálogo</span>
                  {catalogMiners.length > 0 ? (
                    <select
                      value={formMinerId ?? ''}
                      onChange={(e) => setFormMinerId(e.target.value ? Number(e.target.value) : null)}
                      required
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    >
                      <option value="">Selecione uma máquina do catálogo...</option>
                      {catalogMiners.map((miner) => (
                        <option key={miner.id} value={miner.id}>
                          {miner.name} (+{miner.baseHashRate ?? miner.hashRate} H/s)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      placeholder="ID da Máquina no Catálogo"
                      value={formMinerId ?? ''}
                      onChange={(e) => setFormMinerId(e.target.value ? Number(e.target.value) : null)}
                      required
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                  )}
                  <span className="text-[10px] text-slate-500">
                    O jogador receberá a máquina diretamente em seu Reward Inbox
                  </span>
                </label>
              ) : null}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="space-y-1 block">
                  <span className="font-semibold text-slate-400">Ordem de Exibição</span>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>

                <div className="flex items-center justify-between pt-5">
                  <span className="font-semibold text-slate-400">Marco Ativo?</span>
                  <button
                    type="button"
                    onClick={() => setFormActive(!formActive)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formActive ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 font-bold text-slate-300 hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 font-black text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editingMilestone ? 'Atualizar Marco' : 'Salvar Marco'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Modal: Streak Anomalies Scanner */}
      {showAnomaliesModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-black text-white flex items-center gap-2 text-rose-400">
                <AlertTriangle className="h-5 w-5" />
                Diagnóstico de Anomalias de Streak
              </h2>
              <button
                type="button"
                onClick={() => setShowAnomaliesModal(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Varredura de jogadores com saltos incoerentes de sequência ou quebras de grace window / freeze.
            </p>

            {loadingAnomalies ? (
              <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin text-rose-400" />
                <span className="text-xs">Escaneando anomalias no banco...</span>
              </div>
            ) : anomalies.length === 0 ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                <p className="text-sm font-bold text-white">Nenhuma anomalia detectada</p>
                <p className="mt-1 text-xs text-slate-500">
                  Todas as sequências e check-ins no período estão matematicamente consistentes.
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">User ID</th>
                      <th className="px-3 py-2 font-semibold">Jogador</th>
                      <th className="px-3 py-2 font-semibold">Streak Atual</th>
                      <th className="px-3 py-2 font-semibold">Check-ins</th>
                      <th className="px-3 py-2 font-semibold">Grace Gap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {anomalies.map((a, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2 font-mono text-slate-400">#{a.userId}</td>
                        <td className="px-3 py-2">
                          <span className="font-bold text-white">{a.username || a.email}</span>
                        </td>
                        <td className="px-3 py-2 font-black text-rose-400">{a.streak} dias</td>
                        <td className="px-3 py-2">{a.checkinsInWindow} registros</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                              a.hasGraceGap ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {a.hasGraceGap ? 'SIM' : 'NÃO'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowAnomaliesModal(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: Confirm Delete */}
      {deleteConfirmId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-400" />
              Confirmar exclusão de marco
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Tem certeza que deseja excluir permanentemente este marco de check-in? Jogadores que atingirem este dia de streak não receberão mais este prêmio.
            </p>
            <div className="mt-6 flex justify-end gap-3 text-xs">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                disabled={deleting}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 font-bold text-white hover:bg-rose-600 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir Marco
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
