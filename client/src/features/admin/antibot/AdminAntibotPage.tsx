import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  Activity,
  Users,
  Skull,
  BarChart3,
  History,
  Monitor,
  Fingerprint,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';
import {
  AlertsTab,
  DevicesTab,
  EvidenceTab,
  OverviewTab,
  SessionsTab,
  StatCard,
} from './adminAntibot.parts';
import { BAND_STYLE, bandForScore } from './adminAntibot.shared';
import type {
  AlertRow,
  DeviceRow,
  EvidenceRow,
  OverviewData,
  PagedResource,
  SessionRow,
  Tab,
} from './adminAntibot.parts';

export default function AdminAntibot() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await api.get<OverviewData>('/admin/antibot/overview?limit=20');
      setOverview(res.data);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? t('admin_antibot.error_load'));
    } finally {
      setLoadingOverview(false);
    }
  }, [t]);

  const handleClearAll = useCallback(async () => {
    if (!window.confirm('Limpar TODA a base do antibot (evidências, alertas, sessões, dispositivos) e zerar todos os perfis? Ação irreversível.')) return;
    setClearing(true);
    try {
      const res = await api.post<{ ok: boolean; evidenceDeleted?: number }>('/admin/antibot/reset');
      if (res.data.ok) {
        toast.success(`Antibot limpo (${res.data.evidenceDeleted ?? 0} evidências removidas).`);
        void loadOverview();
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao limpar antibot.');
    } finally {
      setClearing(false);
    }
  }, [loadOverview]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const tabs: { id: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'overview',  label: 'Visão Geral',  icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'evidence',  label: 'Evidências',   icon: <History className="w-3.5 h-3.5" /> },
    { id: 'sessions',  label: 'Sessões',      icon: <Monitor className="w-3.5 h-3.5" /> },
    { id: 'devices',   label: 'Dispositivos', icon: <Fingerprint className="w-3.5 h-3.5" /> },
    { id: 'alerts',    label: 'Alertas',      icon: <AlertTriangle className="w-3.5 h-3.5" />, badge: overview?.openAlerts },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-red-950/20 p-6">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #ef4444 0%, transparent 60%)' }} />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shadow-lg shadow-red-500/10">
              <ShieldAlert className="w-7 h-7 text-red-400" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Motor AntiBot</h1>
              <p className="text-slate-400 text-sm mt-0.5 max-w-lg">
                Detecção inteligente multi-sinal de automação e comportamento suspeito. Esta camada apenas analisa — nunca bloqueia usuários legítimos.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadOverview()}
              disabled={loadingOverview}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 text-sm font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loadingOverview ? 'animate-spin' : ''}`} aria-hidden />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void handleClearAll()}
              disabled={clearing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-800/60 bg-red-900/30 text-red-300 text-sm font-bold hover:bg-red-900/50 disabled:opacity-50 transition-colors"
            >
              <Trash2 className={`w-4 h-4 ${clearing ? 'animate-pulse' : ''}`} aria-hidden />
              {clearing ? 'Limpando…' : 'Limpar tudo'}
            </button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5 text-blue-400" />}
          label="Perfis"
          value={overview?.totals.profiles ?? '—'}
          sub="usuários rastreados"
          color="blue"
          loading={loadingOverview && !overview}
        />
        <StatCard
          icon={<Skull className="w-5 h-5 text-red-400" />}
          label="Risco Máx"
          value={overview?.totals.maxRisk ?? '—'}
          sub={overview ? `banda: ${BAND_STYLE[bandForScore(overview.totals.maxRisk)].label}` : ''}
          color="red"
          loading={loadingOverview && !overview}
        />
        <StatCard
          icon={<Activity className="w-5 h-5 text-amber-400" />}
          label="Risco Médio"
          value={overview?.totals.avgRisk ?? '—'}
          sub="média da base"
          color="amber"
          loading={loadingOverview && !overview}
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-orange-400" />}
          label="Alertas Abertos"
          value={overview?.openAlerts ?? '—'}
          sub="aguardando revisão"
          color={overview && overview.openAlerts > 0 ? 'orange' : 'slate'}
          loading={loadingOverview && !overview}
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800">
        {tabs.map(({ id, label, icon, badge }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-t-xl transition-colors ${
              tab === id
                ? 'border-b-2 border-amber-500 bg-amber-500/10 text-amber-400'
                : 'text-slate-500 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            {icon}
            {label}
            {badge != null && badge > 0 ? (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black">
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === 'overview' ? (
          <OverviewTab
            overview={overview}
            loading={loadingOverview}
            onProfileNavigate={(userId) => navigate(`/admin/antibot/users/${userId}`)}
          />
        ) : null}
        {tab === 'evidence' ? <EvidenceTabContainer /> : null}
        {tab === 'sessions' ? <SessionsTabContainer /> : null}
        {tab === 'devices' ? <DevicesTabContainer /> : null}
        {tab === 'alerts' ? <AlertsTabContainer onResolved={loadOverview} /> : null}
      </div>
    </div>
  );
}

function usePagedResource<T>(endpoint: string): PagedResource<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<{ ok: boolean; items: T[]; total: number }>(`${endpoint}?${params.toString()}`);
      setItems(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [endpoint, page, limit, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, total, page, limit, loading, q, setPage, setQ, reload: load };
}

function EvidenceTabContainer() {
  const resource = usePagedResource<EvidenceRow>('/admin/antibot/evidence');
  return <EvidenceTab resource={resource} />;
}

function SessionsTabContainer() {
  const resource = usePagedResource<SessionRow>('/admin/antibot/sessions');
  return <SessionsTab resource={resource} />;
}

function DevicesTabContainer() {
  const resource = usePagedResource<DeviceRow>('/admin/antibot/devices');
  return <DevicesTab resource={resource} />;
}

function AlertsTabContainer({ onResolved }: { onResolved: () => void }) {
  const { t } = useTranslation();
  const resource = usePagedResource<AlertRow>('/admin/antibot/alerts');
  const [updating, setUpdating] = useState<number | null>(null);

  const updateStatus = async (id: number, status: string) => {
    setUpdating(id);
    try {
      await api.patch(`/admin/antibot/alerts/${id}`, { status });
      await resource.reload();
      onResolved();
      toast.success(status === 'resolved' ? 'Alerta resolvido' : 'Status atualizado');
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? t('admin_antibot.error_update'));
    } finally {
      setUpdating(null);
    }
  };

  return <AlertsTab resource={resource} updating={updating} onUpdateStatus={updateStatus} />;
}
