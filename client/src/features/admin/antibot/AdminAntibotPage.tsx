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
  X,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { readAxiosResponseMessage } from '../lib/admin.api';
import { adminAntibotApi } from './adminAntibot.api';
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
} from './adminAntibot.types';

export default function AdminAntibot() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await adminAntibotApi.getOverview(20);
      setOverview(res.data);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? t('admin_antibot.error_load'));
    } finally {
      setLoadingOverview(false);
    }
  }, [t]);

  const handleClearAll = useCallback(async () => {
    setClearing(true);
    try {
      const res = await adminAntibotApi.resetAll();
      if (res.data.ok) {
        toast.success(`Antibot limpo (${res.data.evidenceDeleted ?? 0} evidências removidas).`);
        setResetModalOpen(false);
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
              <RefreshCw className={`w-4 h-4 ${loadingOverview ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-bold hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Limpar Base
            </button>
          </div>
        </div>

        {/* Global Summary Stats */}
        {overview?.totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
            <StatCard
              icon={<Users className="w-4 h-4 text-blue-400" />}
              label="Perfis Rastreados"
              value={overview.totals.profiles}
              color="blue"
            />
            <StatCard
              icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
              label="Alertas Abertos"
              value={overview.openAlerts}
              color={overview.openAlerts > 0 ? 'amber' : 'slate'}
            />
            <StatCard
              icon={<Skull className="w-4 h-4 text-red-400" />}
              label="Risco Máximo"
              value={overview.totals.maxRisk}
              sub={`Faixa: ${BAND_STYLE[bandForScore(overview.totals.maxRisk)].label}`}
              color="red"
            />
            <StatCard
              icon={<Activity className="w-4 h-4 text-purple-400" />}
              label="Risco Médio"
              value={`${overview.totals.avgRisk}/100`}
              color="orange"
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-2 -mb-px overflow-x-auto">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                  active
                    ? 'border-red-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {t.icon}
                {t.label}
                {typeof t.badge === 'number' && t.badge > 0 ? (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {t.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Panels */}
      <div>
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

      {/* Confirmation Modal for Resetting All AntiBot Data */}
      {resetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-white">Zerar Base do AntiBot?</h3>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Esta ação é <strong className="text-red-400 font-bold">irreversível</strong>. Todos os registros de evidências,
              alertas, sessões e fingerprints de dispositivos serão permanentemente excluídos e os perfis de risco serão zerados.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                disabled={clearing}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleClearAll()}
                disabled={clearing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500 bg-red-600 hover:bg-red-500 text-xs font-black text-white shadow-lg shadow-red-600/20 disabled:opacity-50"
              >
                {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Confirmar Limpeza
              </button>
            </div>
          </div>
        </div>
      )}
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
      await adminAntibotApi.updateAlertStatus(id, status as 'open' | 'acknowledged' | 'resolved');
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
