import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  ExternalLink,
  Fingerprint,
  Globe,
  Hash,
  History,
  Loader2,
  Monitor,
  Search,
  ShieldCheck,
  Skull,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import { BAND_STYLE, SEVERITY_STYLE, bandForScore, fmtDateShort } from './adminAntibot.shared';
import type { RiskBand } from './adminAntibot.shared';

export type { RiskBand } from './adminAntibot.shared';

export type TopRiskRow = {
  userId: number;
  riskScore: number;
  trustScore: number;
  peakRiskScore: number;
  evidenceCount: number;
  lastEventAt: string | null;
  updatedAt: string;
  user: { id: number; username: string | null; email: string; isBanned: boolean };
};

export type AlertRow = {
  id: number;
  type: string;
  severity: string;
  status: string;
  riskScore: number;
  message: string | null;
  createdAt: string;
  user: { id: number; username: string | null; email: string } | null;
};

export type OverviewData = {
  ok: boolean;
  topRisk: TopRiskRow[];
  openAlerts: number;
  recentAlerts: AlertRow[];
  totals: { profiles: number; maxRisk: number; avgRisk: number };
};

export type EvidenceRow = {
  id: number;
  userId: number;
  sessionId: string | null;
  eventType: string;
  detector: string;
  code: string;
  reason: string;
  weight: number;
  scoreBefore: number;
  scoreAfter: number;
  severity: string;
  ip: string | null;
  deviceId: string | null;
  fingerprint: string | null;
  createdAt: string;
};

export type SessionRow = {
  id: number;
  userId: number;
  sessionId: string;
  ip: string | null;
  browser: string | null;
  os: string | null;
  platform: string | null;
  deviceId: string | null;
  fingerprint: string | null;
  language: string | null;
  timezone: string | null;
  createdAt: string;
  lastSeenAt: string;
};

export type DeviceRow = {
  deviceId: string;
  fingerprint: string | null;
  canvasHash: string | null;
  webglVendor: string | null;
  webglRenderer: string | null;
  platform: string | null;
  accountCount: number;
  lastSeenAt: string;
};

export type Tab = 'overview' | 'evidence' | 'sessions' | 'devices' | 'alerts';

export type PagedResource<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  q: string;
  setPage: (page: number) => void;
  setQ: (value: string) => void;
  reload: () => Promise<void>;
};

export function ScoreBadge({ score }: { score: number }) {
  const band = bandForScore(score);
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-black tabular-nums ${BAND_STYLE[band].badge}`}>
      {score}
    </span>
  );
}

export function RiskBar({ score }: { score: number }) {
  const band = bandForScore(score);
  return (
    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${BAND_STYLE[band].bar}`} style={{ width: `${Math.min(100, score)}%` }} />
    </div>
  );
}

export function StatCard({
  icon, label, value, sub, color, loading,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: string;
  color: 'blue' | 'red' | 'amber' | 'orange' | 'slate';
  loading?: boolean;
}) {
  const accent: Record<string, string> = {
    blue:   'border-blue-500/20 bg-blue-500/5',
    red:    'border-red-500/20 bg-red-500/5',
    amber:  'border-amber-500/20 bg-amber-500/5',
    orange: 'border-orange-500/20 bg-orange-500/5',
    slate:  'border-slate-700/50 bg-slate-900/40',
  };
  return (
    <div className={`rounded-2xl border p-4 ${accent[color]}`}>
      <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-3xl font-black text-white tabular-nums">
        {loading ? <Loader2 className="w-6 h-6 animate-spin text-slate-600" /> : value}
      </div>
      {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

export function OverviewTab({
  overview,
  loading,
  onProfileNavigate,
}: {
  overview: OverviewData | null;
  loading: boolean;
  onProfileNavigate: (userId: number) => void;
}) {
  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center min-h-[30vh] text-slate-400 gap-2">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">Carregando dados...</span>
      </div>
    );
  }
  if (!overview) return null;

  return (
    <div className="space-y-4">
      {overview.topRisk.length > 0 ? (
        <div className="grid grid-cols-5 gap-2">
          {(['trusted', 'low', 'suspicious', 'high', 'critical'] as RiskBand[]).map((band) => {
            const count = overview.topRisk.filter((r) => bandForScore(r.riskScore) === band).length;
            return (
              <div key={band} className={`rounded-xl border p-3 text-center ${BAND_STYLE[band].badge}`}>
                <div className="text-xl font-black tabular-nums">{count}</div>
                <div className="text-[10px] font-bold uppercase mt-1">{BAND_STYLE[band].label}</div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Perfis de Maior Risco" icon={<Skull className="w-4 h-4 text-red-400" />}>
          <div className="divide-y divide-slate-800/60">
            {overview.topRisk.length === 0 ? (
              <Empty icon={<ShieldCheck className="w-8 h-8 text-emerald-500/50" />} text="Nenhum perfil de risco encontrado" />
            ) : (
              overview.topRisk.map((r) => (
                <div key={r.userId} className="px-2 py-3 flex items-center gap-3 hover:bg-slate-800/20 rounded-xl transition-colors">
                  <ScoreBadge score={r.riskScore} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white font-semibold truncate flex items-center gap-2">
                      {r.user.username || r.user.email}
                      {r.user.isBanned ? (
                        <span className="text-[9px] font-black uppercase bg-red-500/10 text-red-400 border border-red-500/20 rounded px-1.5 py-0.5">Banido</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <RiskBar score={r.riskScore} />
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      #{r.userId} · {r.evidenceCount} evidências · pico: {r.peakRiskScore}
                      {r.lastEventAt ? ` · ${fmtDateShort(r.lastEventAt)}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[9px] font-black uppercase border rounded px-1.5 py-0.5 ${BAND_STYLE[bandForScore(r.riskScore)].badge}`}>
                      {BAND_STYLE[bandForScore(r.riskScore)].label}
                    </span>
                    <button
                      type="button"
                      onClick={() => onProfileNavigate(r.userId)}
                      className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-500 hover:text-amber-400 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ver perfil
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Alertas Recentes" icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}>
          <div className="divide-y divide-slate-800/60">
            {overview.recentAlerts.length === 0 ? (
              <Empty icon={<ShieldCheck className="w-8 h-8 text-emerald-500/50" />} text="Nenhum alerta recente" />
            ) : (
              overview.recentAlerts.map((a) => (
                <div key={a.id} className="px-2 py-3 hover:bg-slate-800/20 rounded-xl transition-colors">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-black uppercase border rounded px-1.5 py-0.5 ${SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info}`}>
                      {a.severity}
                    </span>
                    <span className="text-sm text-white font-medium truncate flex-1">{a.message || a.type}</span>
                    {a.status === 'resolved' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                    {a.user ? (
                      <>
                        <Users className="w-3 h-3" />
                        {a.user.username || a.user.email}
                        <span className="text-slate-700">·</span>
                      </>
                    ) : null}
                    <Hash className="w-3 h-3" />{a.id}
                    <span className="text-slate-700">·</span>
                    {fmtDateShort(a.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function EvidenceTab({ resource }: { resource: PagedResource<EvidenceRow> }) {
  return (
    <Panel title="Histórico de Evidências" icon={<History className="w-4 h-4 text-blue-400" />}>
      <Toolbar q={resource.q} setQ={resource.setQ} onSearch={() => void resource.reload()} placeholder="Buscar por userId, IP, device..." />
      <Table
        loading={resource.loading}
        head={['#', 'Usuário', 'Detector', 'Código', 'Motivo', 'Peso', 'Score', 'IP', 'Data']}
        empty={<Empty icon={<History className="w-8 h-8 text-slate-600" />} text="Nenhuma evidência encontrada" />}
      >
        {resource.items.map((e) => (
          <tr key={e.id} className="hover:bg-slate-800/25 transition-colors">
            <td className="px-3 py-2.5 text-slate-500 text-[11px]">{e.id}</td>
            <td className="px-3 py-2.5 text-white font-semibold">{e.userId}</td>
            <td className="px-3 py-2.5">
              <span className="text-[10px] font-bold uppercase bg-slate-800 text-slate-300 rounded px-1.5 py-0.5">{e.detector}</span>
            </td>
            <td className="px-3 py-2.5 text-slate-300 font-mono text-[11px]">{e.code}</td>
            <td className="px-3 py-2.5 text-slate-400 text-[12px] max-w-[180px] truncate" title={e.reason}>{e.reason}</td>
            <td className="px-3 py-2.5">
              <span className={`font-black text-sm ${e.weight >= 20 ? 'text-red-400' : e.weight >= 10 ? 'text-amber-400' : 'text-lime-400'}`}>
                +{e.weight}
              </span>
            </td>
            <td className="px-3 py-2.5 text-[11px]">
              <span className="text-slate-500">{e.scoreBefore}</span>
              <ChevronRight className="inline w-3 h-3 text-slate-600 mx-0.5" />
              <span className={`font-black ${e.scoreAfter >= 80 ? 'text-red-400' : e.scoreAfter >= 60 ? 'text-amber-400' : 'text-white'}`}>
                {e.scoreAfter}
              </span>
            </td>
            <td className="px-3 py-2.5 text-slate-400 font-mono text-[11px]">{e.ip ?? '—'}</td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-[11px]">{fmtDateShort(e.createdAt)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={resource.page} total={resource.total} limit={resource.limit} setPage={resource.setPage} />
    </Panel>
  );
}

export function SessionsTab({ resource }: { resource: PagedResource<SessionRow> }) {
  return (
    <Panel title="Sessões Rastreadas" icon={<Monitor className="w-4 h-4 text-violet-400" />}>
      <Toolbar q={resource.q} setQ={resource.setQ} onSearch={() => void resource.reload()} placeholder="Buscar por userId, IP, fingerprint..." />
      <Table
        loading={resource.loading}
        head={['#', 'Usuário', 'IP', 'Navegador', 'OS', 'Timezone', 'Device ID', 'Fingerprint', 'Último Acesso']}
        empty={<Empty icon={<Monitor className="w-8 h-8 text-slate-600" />} text="Nenhuma sessão encontrada" />}
      >
        {resource.items.map((s) => (
          <tr key={s.id} className="hover:bg-slate-800/25 transition-colors">
            <td className="px-3 py-2.5 text-slate-500 text-[11px]">{s.id}</td>
            <td className="px-3 py-2.5 text-white font-semibold">{s.userId}</td>
            <td className="px-3 py-2.5 text-slate-400 font-mono text-[11px]">
              <span className="flex items-center gap-1"><Globe className="w-3 h-3 shrink-0" />{s.ip ?? '—'}</span>
            </td>
            <td className="px-3 py-2.5 text-slate-300 text-[12px]">{s.browser ?? '—'}</td>
            <td className="px-3 py-2.5 text-slate-300 text-[12px]">{s.os ?? '—'}</td>
            <td className="px-3 py-2.5 text-slate-400 text-[11px]">{s.timezone ?? '—'}</td>
            <td className="px-3 py-2.5 text-amber-300/80 font-mono text-[10px]">{s.deviceId ? s.deviceId.slice(0, 10) + '…' : '—'}</td>
            <td className="px-3 py-2.5 text-slate-400 font-mono text-[10px]">{s.fingerprint ? s.fingerprint.slice(0, 10) + '…' : '—'}</td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-[11px]">{fmtDateShort(s.lastSeenAt)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={resource.page} total={resource.total} limit={resource.limit} setPage={resource.setPage} />
    </Panel>
  );
}

export function DevicesTab({ resource }: { resource: PagedResource<DeviceRow> }) {
  return (
    <Panel title="Dispositivos Únicos" icon={<Fingerprint className="w-4 h-4 text-emerald-400" />}>
      <p className="text-[11px] text-slate-500 px-3 pb-2">
        Dispositivos com múltiplas contas indicam possível farm em massa. <span className="text-red-400">Vermelho = 5+ contas</span>, <span className="text-amber-400">âmbar = 3–4 contas</span>.
      </p>
      <Table
        loading={resource.loading}
        head={['Device ID', 'Contas', 'Plataforma', 'WebGL Renderer', 'Fingerprint', 'Último Acesso']}
        empty={<Empty icon={<Fingerprint className="w-8 h-8 text-slate-600" />} text="Nenhum dispositivo rastreado" />}
      >
        {resource.items.map((d) => (
          <tr key={d.deviceId} className={`hover:bg-slate-800/25 transition-colors ${d.accountCount >= 5 ? 'bg-red-500/5' : d.accountCount >= 3 ? 'bg-amber-500/5' : ''}`}>
            <td className="px-3 py-2.5 font-mono text-[11px] text-amber-300/80">{d.deviceId.slice(0, 14)}…</td>
            <td className="px-3 py-2.5">
              <span className={`inline-flex items-center gap-1 font-black text-sm px-2 py-0.5 rounded-lg border ${
                d.accountCount >= 5
                  ? 'text-red-300 bg-red-500/10 border-red-500/20'
                  : d.accountCount >= 3
                    ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                    : 'text-slate-300 bg-slate-800 border-slate-700'
              }`}>
                {d.accountCount >= 3 ? <AlertTriangle className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {d.accountCount}
              </span>
            </td>
            <td className="px-3 py-2.5 text-slate-300 text-[12px]">{d.platform ?? '—'}</td>
            <td className="px-3 py-2.5 text-slate-400 text-[11px] max-w-[200px] truncate">{d.webglRenderer?.slice(0, 35) ?? '—'}</td>
            <td className="px-3 py-2.5 text-slate-400 font-mono text-[10px]">{d.fingerprint ? d.fingerprint.slice(0, 10) + '…' : '—'}</td>
            <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-[11px]">{fmtDateShort(d.lastSeenAt)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={resource.page} total={resource.total} limit={resource.limit} setPage={resource.setPage} />
    </Panel>
  );
}

export function AlertsTab({
  resource,
  updating,
  onUpdateStatus,
}: {
  resource: PagedResource<AlertRow>;
  updating: number | null;
  onUpdateStatus: (id: number, status: string) => void | Promise<void>;
}) {
  return (
    <Panel title="Alertas do Motor AntiBot" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
      <Toolbar q={resource.q} setQ={resource.setQ} onSearch={() => void resource.reload()} placeholder="Buscar por userId, tipo..." />
      <Table
        loading={resource.loading}
        head={['#', 'Tipo', 'Severidade', 'Mensagem', 'Usuário', 'Risk', 'Data', 'Ações']}
        empty={
          <Empty
            icon={<ShieldCheck className="w-10 h-10 text-emerald-500/50" />}
            text="Nenhum alerta encontrado"
            sub="O motor não detectou comportamentos suspeitos relevantes."
          />
        }
      >
        {resource.items.map((a) => (
          <tr key={a.id} className="hover:bg-slate-800/25 transition-colors">
            <td className="px-3 py-3 text-slate-500 text-[11px]">{a.id}</td>
            <td className="px-3 py-3">
              <span className="text-[10px] font-bold font-mono bg-slate-800 text-slate-300 rounded px-1.5 py-0.5">{a.type}</span>
            </td>
            <td className="px-3 py-3">
              <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase border rounded px-1.5 py-0.5 ${SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.info}`}>
                {a.severity === 'critical' ? <Zap className="w-3 h-3" /> : a.severity === 'high' ? <AlertTriangle className="w-3 h-3" /> : null}
                {a.severity}
              </span>
            </td>
            <td className="px-3 py-3 text-slate-300 text-[12px] max-w-[200px] truncate" title={a.message ?? undefined}>{a.message ?? '—'}</td>
            <td className="px-3 py-3 text-slate-400 text-[12px]">
              {a.user ? (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3 shrink-0" />
                  {a.user.username || a.user.email}
                </span>
              ) : '—'}
            </td>
            <td className="px-3 py-3"><ScoreBadge score={a.riskScore} /></td>
            <td className="px-3 py-3 text-slate-500 whitespace-nowrap text-[11px]">{fmtDateShort(a.createdAt)}</td>
            <td className="px-3 py-3">
              {a.status !== 'resolved' ? (
                <button
                  onClick={() => void onUpdateStatus(a.id, 'resolved')}
                  disabled={updating === a.id}
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase border border-emerald-500/30 text-emerald-300 bg-emerald-500/10 rounded-lg px-2 py-1 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                >
                  {updating === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Resolver
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
                  <XCircle className="w-3 h-3" />
                  Resolvido
                </span>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <Pager page={resource.page} total={resource.total} limit={resource.limit} setPage={resource.setPage} />
    </Panel>
  );
}

export function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-800/50 flex items-center gap-2">
        {icon}
        <h2 className="text-xs font-black uppercase tracking-widest text-amber-400/90">{title}</h2>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

export function Empty({ icon, text, sub }: { icon?: ReactNode; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      {icon}
      <p className="text-sm text-slate-400 font-medium">{text}</p>
      {sub ? <p className="text-[11px] text-slate-600 max-w-xs">{sub}</p> : null}
    </div>
  );
}

export function Toolbar({ q, setQ, onSearch, placeholder }: { q: string; setQ: (value: string) => void; onSearch: () => void; placeholder?: string }) {
  return (
    <div className="flex gap-2 p-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
          placeholder={placeholder ?? 'Buscar...'}
          className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-2 pl-10 pr-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-shadow"
        />
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 transition-colors"
      >
        <Search className="w-4 h-4" />
      </button>
    </div>
  );
}

export function Table({ head, children, loading, empty }: { head: string[]; children: ReactNode; loading: boolean; empty?: ReactNode }) {
  const isEmpty = !loading && (children == null || (Array.isArray(children) && children.length === 0));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
          <tr>
            {head.map((h) => <th key={h} className="px-3 py-3">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {loading ? (
            <tr><td colSpan={head.length} className="text-center py-12 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin inline" />
            </td></tr>
          ) : isEmpty ? (
            <tr><td colSpan={head.length}>{empty ?? <Empty text="Nenhum resultado" />}</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, total, limit, setPage }: { page: number; total: number; limit: number; setPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex items-center justify-between px-3 py-3 text-[11px] text-slate-500 border-t border-slate-800/60 mt-2">
      <span>Exibindo {from}–{to} de {total} registros</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => setPage(1)} className="px-2 py-1 rounded-lg border border-slate-700 disabled:opacity-30 hover:bg-slate-800 transition-colors">«</button>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 py-1 rounded-lg border border-slate-700 disabled:opacity-30 hover:bg-slate-800 transition-colors">‹</button>
        <span className="px-3 py-1 tabular-nums font-bold text-white">{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="px-2 py-1 rounded-lg border border-slate-700 disabled:opacity-30 hover:bg-slate-800 transition-colors">›</button>
        <button disabled={page >= pages} onClick={() => setPage(pages)} className="px-2 py-1 rounded-lg border border-slate-700 disabled:opacity-30 hover:bg-slate-800 transition-colors">»</button>
      </div>
    </div>
  );
}
