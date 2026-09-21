import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Download,
  Eye,
  CircleCheck,
  CircleX,
  CircleAlert,
  User,
  Shield,
  Clock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Laptop,
  Smartphone,
  Globe,
  X,
} from 'lucide-react';
import { getAdminAuditLogs, getAdminAuditStats } from '../lib/admin.api';
import type { AdminAuditLogRow, AdminAuditStats } from '../lib/admin.types';

// ---------------------------------------------------------------------------
// Helpers & Formatters
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 10) return 'agora';
    if (diff < 60) return `há ${diff}s`;
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`;
    return formatDate(iso).split(',')[0] ?? '';
  } catch {
    return '';
  }
}

function parseDevice(ua: string | null) {
  if (!ua) return { isMobile: false, label: 'Desconhecido', browser: 'N/A' };
  const lower = ua.toLowerCase();
  const isMobile = /mobile|android|iphone|ipad/i.test(lower);
  let browser = 'Navegador';
  if (lower.includes('chrome') && !lower.includes('edg')) browser = 'Chrome';
  else if (lower.includes('firefox')) browser = 'Firefox';
  else if (lower.includes('edg')) browser = 'Edge';
  else if (lower.includes('safari') && !lower.includes('chrome')) browser = 'Safari';

  return { isMobile, label: isMobile ? 'Mobile' : 'Desktop', browser };
}

function getActionMeta(action: string) {
  const map: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
    ADMIN_LOGIN_SUCCESS: {
      label: 'Login Realizado',
      badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      dotClass: 'bg-emerald-400',
    },
    ADMIN_LOGIN_FAILURE: {
      label: 'Falha no Login',
      badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      dotClass: 'bg-rose-400',
    },
    ADMIN_LOGOUT: {
      label: 'Logout',
      badgeClass: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
      dotClass: 'bg-gray-400',
    },
    ADMIN_GRANT_MINER: {
      label: 'Conceder Máquina',
      badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      dotClass: 'bg-purple-400',
    },
    ADMIN_UNLOCK_ACCOUNT: {
      label: 'Desbloquear Conta',
      badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      dotClass: 'bg-cyan-400',
    },
    ADMIN_UPDATE: {
      label: 'Atualizar Admin',
      badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      dotClass: 'bg-blue-400',
    },
    ADMIN_PROFILE_UPDATE: {
      label: 'Atualizar Perfil',
      badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      dotClass: 'bg-sky-400',
    },
    ADMIN_PASSWORD_CHANGE: {
      label: 'Troca de Senha',
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      dotClass: 'bg-amber-400',
    },
    ADMIN_SESSION_REVOKE: {
      label: 'Sessão Revogada',
      badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      dotClass: 'bg-orange-400',
    },
    ADMIN_SESSIONS_REVOKE_OTHER: {
      label: 'Outras Sessões Revogadas',
      badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      dotClass: 'bg-orange-400',
    },
    ADMIN_MINER_CREATE: {
      label: 'Criar Mineradora',
      badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
      dotClass: 'bg-violet-400',
    },
    ADMIN_MINER_UPDATE: {
      label: 'Editar Mineradora',
      badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
      dotClass: 'bg-violet-400',
    },
  };

  if (map[action]) return map[action]!;

  const readable = action
    .replace(/^ADMIN_/, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    label: readable,
    badgeClass: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    dotClass: 'bg-slate-400',
  };
}

function getModuleMeta(module: string | null) {
  if (!module) return { label: 'Geral', badgeClass: 'bg-gray-500/10 text-gray-400 border-gray-500/20' };
  const m = module.toLowerCase();
  switch (m) {
    case 'auth':
      return { label: 'Autenticação', badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
    case 'users':
      return { label: 'Usuários', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
    case 'admins':
      return { label: 'Administração', badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' };
    case 'miners':
      return { label: 'Mineradoras', badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20' };
    case 'tournaments':
      return { label: 'Torneios', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
    case 'finance':
      return { label: 'Financeiro', badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20' };
    case 'system':
      return { label: 'Sistema', badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' };
    default:
      return { label: module, badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AdminAuditLogAdmin() {
  const [rows, setRows] = useState<AdminAuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminAuditStats | null>(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedSuccess, setSelectedSuccess] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('all'); // all, today, 7d, 30d
  const [quickChip, setQuickChip] = useState<string>('all'); // all, failures, logins, changes

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Selected row for detail modal
  const [selectedRow, setSelectedRow] = useState<AdminAuditLogRow | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Compute from/to date based on datePreset
  const dateRange = useMemo(() => {
    if (datePreset === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString() };
    }
    if (datePreset === '7d') {
      const start = new Date(Date.now() - 7 * 86400 * 1000);
      return { from: start.toISOString() };
    }
    if (datePreset === '30d') {
      const start = new Date(Date.now() - 30 * 86400 * 1000);
      return { from: start.toISOString() };
    }
    return {};
  }, [datePreset]);

  // Load stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await getAdminAuditStats();
      if (res.data?.ok && res.data.stats) {
        setStats(res.data.stats);
      }
    } catch {
      // best-effort
    }
  }, []);

  // Load audit rows
  const fetchRows = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page,
        pageSize,
      };

      if (search.trim()) params.search = search.trim();
      if (selectedAdminId) params.adminId = Number(selectedAdminId);
      if (selectedModule) params.module = selectedModule;
      if (selectedSuccess === 'true') params.success = true;
      if (selectedSuccess === 'false') params.success = false;
      if (dateRange.from) params.from = dateRange.from;

      const res = await getAdminAuditLogs(params as Parameters<typeof getAdminAuditLogs>[0]);
      if (res.data?.ok) {
        setRows(res.data.rows || []);
        setTotal(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch {
      // keep current
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [page, pageSize, search, selectedAdminId, selectedModule, selectedSuccess, dateRange]);

  // Initial load
  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchRows(true);
  }, [fetchRows]);

  // Auto-refresh interval (every 10s if enabled)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void fetchRows(false);
      void fetchStats();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchRows, fetchStats]);

  // Handle Quick Chips
  const handleQuickChip = (chip: string) => {
    setQuickChip(chip);
    setPage(1);
    if (chip === 'all') {
      setSelectedSuccess('');
      setSelectedModule('');
      setSearch('');
    } else if (chip === 'failures') {
      setSelectedSuccess('false');
      setSelectedModule('');
    } else if (chip === 'logins') {
      setSelectedSuccess('');
      setSelectedModule('auth');
      setSearch('LOGIN');
    } else if (chip === 'changes') {
      setSelectedSuccess('');
      setSelectedModule('');
      setSearch('UPDATE');
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setSearch('');
    setSelectedAdminId('');
    setSelectedModule('');
    setSelectedSuccess('');
    setDatePreset('all');
    setQuickChip('all');
    setPage(1);
  };

  const isFiltered = Boolean(
    search || selectedAdminId || selectedModule || selectedSuccess || datePreset !== 'all' || quickChip !== 'all'
  );

  // Export handlers
  const exportCSV = () => {
    if (!rows.length) return;
    const headers = [
      'ID',
      'Data/Hora',
      'Admin ID',
      'Admin Nome',
      'Admin Email',
      'Acao',
      'Modulo',
      'Recurso',
      'Recurso ID',
      'IP',
      'Status',
      'Erro',
      'Duracao (ms)',
    ];

    const lines = rows.map((r) => [
      `"${r.id}"`,
      `"${r.createdAt}"`,
      r.adminId ?? '',
      `"${r.admin?.name ?? ''}"`,
      `"${r.admin?.email ?? r.adminEmail ?? ''}"`,
      `"${r.action}"`,
      `"${r.module ?? ''}"`,
      `"${r.resource ?? ''}"`,
      `"${r.resourceId ?? ''}"`,
      `"${r.ipAddress ?? ''}"`,
      r.success ? '"OK"' : '"FAIL"',
      `"${(r.errorMsg ?? '').replace(/"/g, '""')}"`,
      r.durationMs ?? '',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...lines.map((l) => l.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `blockminer_admin_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportJSON = () => {
    if (!rows.length) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `blockminer_admin_audit_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy helper
  const copyText = (text: string, type: 'id' | 'payload') => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedPayload(true);
      setTimeout(() => setCopiedPayload(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 via-indigo-500/10 to-transparent border border-blue-500/30 flex items-center justify-center shadow-lg shadow-blue-500/5">
            <ClipboardList className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">Log de Auditoria Administrativa</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
                Imutável & Seguro
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Rastreamento em tempo real de todas as ações, modificações e acessos administrativos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-2 transition-all ${
              autoRefresh
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-sm shadow-emerald-500/10'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title="Atualização automática a cada 10 segundos"
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
            Auto-refresh {autoRefresh ? '(10s)' : 'Off'}
          </button>

          {/* Refresh Manual Button */}
          <button
            onClick={() => {
              void fetchRows(true);
              void fetchStats();
            }}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            Atualizar
          </button>

          {/* Export Dropdown / Buttons */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <button
              onClick={exportCSV}
              disabled={!rows.length}
              className="px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1.5 border-r border-white/10 disabled:opacity-40"
              title="Exportar registros filtrados para CSV"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              CSV
            </button>
            <button
              onClick={exportJSON}
              disabled={!rows.length}
              className="px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
              title="Exportar registros filtrados para JSON"
            >
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* 2. Metrics & Analytics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1: Total Events */}
        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Total Registrado</span>
            <ClipboardList className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {stats ? stats.total.toLocaleString() : total.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
            <span className="text-blue-400 font-semibold">+{stats?.last24hCount ?? 0}</span> nas últimas 24 horas
          </div>
        </div>

        {/* Card 2: Success Rate */}
        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Taxa de Sucesso</span>
            <CircleCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 tracking-tight">
            {stats ? `${stats.successRate}%` : '100%'}
          </div>
          <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
            <span className="text-emerald-400 font-semibold">{stats?.successCount ?? 0} OK</span>
            <span>•</span>
            <span className={stats && stats.failedCount > 0 ? 'text-rose-400 font-semibold' : 'text-gray-500'}>
              {stats?.failedCount ?? 0} erros
            </span>
          </div>
        </div>

        {/* Card 3: Unique Admins */}
        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Administradores</span>
            <Shield className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {stats ? stats.admins.length : 2}
          </div>
          <div className="text-[11px] text-gray-500 mt-1 truncate">
            {stats ? stats.admins.map((a) => a.name).join(', ') : 'Admins cadastrados'}
          </div>
        </div>

        {/* Card 4: Top Action */}
        <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 relative overflow-hidden backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>Ação Mais Frequente</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-sm font-bold text-white tracking-tight truncate mt-1">
            {stats?.topActions[0] ? getActionMeta(stats.topActions[0].action).label : '—'}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {stats?.topActions[0] ? `${stats.topActions[0].count} execuções no histórico` : 'Sem eventos'}
          </div>
        </div>
      </div>

      {/* 3. Filters & Search Bar */}
      <div className="rounded-2xl bg-zinc-900/60 border border-white/10 p-4 space-y-3 backdrop-blur-sm">
        {/* Search row */}
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Global search input */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por ação, admin, IP, recurso ou mensagem de erro..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Admin selector */}
          <div className="w-full md:w-44">
            <select
              value={selectedAdminId}
              onChange={(e) => {
                setSelectedAdminId(e.target.value);
                setPage(1);
              }}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="">Todos os Admins</option>
              {stats?.admins.map((adm) => (
                <option key={adm.id} value={adm.id}>
                  {adm.name} ({adm.email})
                </option>
              ))}
            </select>
          </div>

          {/* Module selector */}
          <div className="w-full md:w-36">
            <select
              value={selectedModule}
              onChange={(e) => {
                setSelectedModule(e.target.value);
                setPage(1);
              }}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="">Todos os Módulos</option>
              {stats?.modulesBreakdown.map((m) => (
                <option key={m.module} value={m.module}>
                  {getModuleMeta(m.module).label} ({m.count})
                </option>
              ))}
            </select>
          </div>

          {/* Result / Status selector */}
          <div className="w-full md:w-32">
            <select
              value={selectedSuccess}
              onChange={(e) => {
                setSelectedSuccess(e.target.value);
                setPage(1);
              }}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="">Todos os Status</option>
              <option value="true">Apenas OK</option>
              <option value="false">Apenas Falhas</option>
            </select>
          </div>

          {/* Date range preset */}
          <div className="w-full md:w-32">
            <select
              value={datePreset}
              onChange={(e) => {
                setDatePreset(e.target.value);
                setPage(1);
              }}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="all">Todo Período</option>
              <option value="today">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>
          </div>
        </div>

        {/* Quick filters chips & clear button */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-white/5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-gray-500 font-medium mr-1 flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" /> Atalhos:
            </span>

            {[
              { id: 'all', label: 'Todos os Eventos' },
              { id: 'failures', label: '⚠️ Falhas & Erros' },
              { id: 'logins', label: '🔑 Acessos (Logins)' },
              { id: 'changes', label: '🛠️ Alterações de Sistema' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => handleQuickChip(chip.id)}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all ${
                  quickChip === chip.id
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold'
                    : 'bg-white/5 text-gray-400 hover:text-white border border-transparent hover:border-white/10'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {isFiltered && (
            <button
              onClick={resetFilters}
              className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 transition-colors px-2 py-0.5 rounded hover:bg-white/5"
            >
              <X className="w-3 h-3" /> Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* 4. Table Container */}
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-sm overflow-hidden shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-3">
            <RefreshCw className="w-7 h-7 animate-spin text-blue-400" />
            <p className="text-xs font-medium">Carregando logs de auditoria...</p>
          </div>
        ) : !rows.length ? (
          <div className="text-center py-20 px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-gray-500">
              <ClipboardList className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">Nenhum evento de auditoria encontrado</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              {isFiltered
                ? 'Nenhum resultado corresponde aos filtros selecionados. Tente ajustar a busca.'
                : 'Não há registros de auditoria gravados no banco de dados.'}
            </p>
            {isFiltered && (
              <button
                onClick={resetFilters}
                className="mt-2 px-3 py-1.5 text-xs rounded-xl bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors inline-block"
              >
                Limpar todos os filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02] text-gray-400 uppercase text-[10px] tracking-wider font-semibold">
                  <th className="px-5 py-3.5">Data & Hora</th>
                  <th className="px-4 py-3.5">Administrador</th>
                  <th className="px-4 py-3.5">Ação Realizada</th>
                  <th className="px-4 py-3.5">Módulo</th>
                  <th className="px-4 py-3.5">Recurso / Alvo</th>
                  <th className="px-4 py-3.5">IP & Dispositivo</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row) => {
                  const actionMeta = getActionMeta(row.action);
                  const moduleMeta = getModuleMeta(row.module);
                  const dev = parseDevice(row.userAgent);

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRow(row)}
                      className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    >
                      {/* 1. Date & Time */}
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="font-medium text-white flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-500" />
                          <span>{formatRelativeTime(row.createdAt)}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                          {formatDate(row.createdAt)}
                        </div>
                      </td>

                      {/* 2. Admin Info */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-[11px] font-bold shadow-sm">
                            {(row.admin?.name ?? row.adminEmail ?? 'A').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white text-xs leading-snug">
                              {row.admin?.name ?? (row.adminEmail ? row.adminEmail.split('@')[0] : 'Sistema')}
                            </div>
                            <div className="text-[10px] text-gray-400 leading-none">
                              {row.admin?.email ?? row.adminEmail ?? 'Ação Automática'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. Action Badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${actionMeta.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${actionMeta.dotClass}`} />
                          {actionMeta.label}
                        </span>
                        <div className="text-[9px] font-mono text-gray-500 mt-0.5 truncate max-w-[160px]">
                          {row.action}
                        </div>
                      </td>

                      {/* 4. Module Badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium border ${moduleMeta.badgeClass}`}
                        >
                          {moduleMeta.label}
                        </span>
                      </td>

                      {/* 5. Resource */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.resource ? (
                          <div>
                            <span className="font-medium text-gray-300">{row.resource}</span>
                            {row.resourceId && (
                              <span className="text-[10px] font-mono text-blue-400 ml-1.5 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                #{row.resourceId}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500 text-[11px]">—</span>
                        )}
                      </td>

                      {/* 6. IP & Device */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-gray-300 text-[11px]">
                          {row.ipAddress ?? '—'}
                        </div>
                        <div className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                          {dev.isMobile ? (
                            <Smartphone className="w-3 h-3 text-gray-400" />
                          ) : (
                            <Laptop className="w-3 h-3 text-gray-400" />
                          )}
                          <span>{dev.browser}</span>
                        </div>
                      </td>

                      {/* 7. Status */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {row.success ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            <CircleCheck className="w-3 h-3" /> OK
                          </span>
                        ) : (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 text-[11px] font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                              <CircleX className="w-3 h-3" /> FALHA
                            </span>
                            {row.errorMsg && (
                              <span className="text-[9px] text-rose-400/80 truncate max-w-[120px] mt-0.5" title={row.errorMsg}>
                                {row.errorMsg}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 8. Action button */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRow(row);
                          }}
                          className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors group-hover:bg-blue-500/20 group-hover:text-blue-300"
                          title="Visualizar detalhes do evento"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-white/5 bg-white/[0.01]">
          {/* Items per page selector & Total counter */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>
              Mostrando <strong className="text-white">{rows.length}</strong> de{' '}
              <strong className="text-white">{total.toLocaleString()}</strong> eventos
            </span>
            <span className="text-gray-600">|</span>
            <div className="flex items-center gap-1.5">
              <span>Por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          {/* Page navigation */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition-colors"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="text-xs text-gray-400 px-2 font-medium">
                Página <strong className="text-white">{page}</strong> de{' '}
                <strong className="text-white">{totalPages}</strong>
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition-colors"
                title="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          MODAL: Event Details Drawer
         --------------------------------------------------------------------- */}
      {selectedRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSelectedRow(null)}
        >
          <div
            className="w-full max-w-2xl bg-zinc-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400 shadow-md">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">
                      {getActionMeta(selectedRow.action).label}
                    </h2>
                    {selectedRow.success ? (
                      <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        SUCESSO
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                        FALHA
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                    <span className="font-mono">ID #{selectedRow.id}</span>
                    <span>•</span>
                    <span>{formatDate(selectedRow.createdAt)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedRow(null)}
                className="p-1.5 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Banner if Failed */}
            {!selectedRow.success && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <CircleAlert className="w-4 h-4" />
                  <span>Erro Reportado na Execução:</span>
                </div>
                <div className="font-mono text-xs text-rose-300 pl-6">
                  {selectedRow.errorMsg || 'Erro desconhecido / falha de validação'}
                </div>
              </div>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Admin */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                <span className="text-gray-400 flex items-center gap-1.5 font-medium">
                  <User className="w-3.5 h-3.5 text-blue-400" /> Administrador Responsável
                </span>
                <div className="font-semibold text-white text-sm">
                  {selectedRow.admin?.name ?? 'Automático / Sistema'}
                </div>
                <div className="text-gray-400 font-mono text-[11px]">
                  {selectedRow.admin?.email ?? selectedRow.adminEmail ?? '—'}
                  {selectedRow.adminId && ` (ID #${selectedRow.adminId})`}
                </div>
              </div>

              {/* Module & Action */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                <span className="text-gray-400 flex items-center gap-1.5 font-medium">
                  <Shield className="w-3.5 h-3.5 text-indigo-400" /> Módulo & Ação Bruta
                </span>
                <div className="font-semibold text-white">
                  Módulo: <span className="text-blue-400">{selectedRow.module ?? '—'}</span>
                </div>
                <div className="font-mono text-[11px] text-gray-300 truncate">
                  {selectedRow.action}
                </div>
              </div>

              {/* Target Resource */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                <span className="text-gray-400 font-medium">Recurso Afetado</span>
                <div className="font-semibold text-white text-sm">
                  {selectedRow.resource ? (
                    <>
                      {selectedRow.resource}
                      {selectedRow.resourceId && (
                        <span className="text-blue-400 font-mono ml-1.5">#{selectedRow.resourceId}</span>
                      )}
                    </>
                  ) : (
                    'Nenhum recurso específico'
                  )}
                </div>
                {selectedRow.durationMs != null && (
                  <div className="text-[11px] text-gray-500">
                    Tempo de resposta: <strong className="text-gray-300">{selectedRow.durationMs}ms</strong>
                  </div>
                )}
              </div>

              {/* IP & Location */}
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 flex items-center gap-1.5 font-medium">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" /> Endereço IP
                  </span>
                  {selectedRow.ipAddress && (
                    <button
                      onClick={() => copyText(selectedRow.ipAddress!, 'id')}
                      className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1"
                    >
                      {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedId ? 'Copiado' : 'Copiar'}
                    </button>
                  )}
                </div>
                <div className="font-mono text-white text-sm">
                  {selectedRow.ipAddress ?? '—'}
                </div>
                {selectedRow.sessionId && (
                  <div className="text-[10px] text-gray-500 font-mono truncate" title={selectedRow.sessionId}>
                    Sessão: {selectedRow.sessionId}
                  </div>
                )}
              </div>
            </div>

            {/* User Agent */}
            {selectedRow.userAgent && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1 text-xs">
                <span className="text-gray-400 font-medium flex items-center gap-1.5">
                  <Laptop className="w-3.5 h-3.5 text-gray-400" /> User-Agent / Navegador
                </span>
                <div className="font-mono text-[11px] text-gray-300 break-all bg-black/30 p-2 rounded-lg border border-white/5">
                  {selectedRow.userAgent}
                </div>
              </div>
            )}

            {/* Payload Changes: Old vs New Value */}
            {(selectedRow.oldValue != null || selectedRow.newValue != null) && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" /> Dados & Modificações
                  </span>
                  <button
                    onClick={() =>
                      copyText(
                        JSON.stringify({ oldValue: selectedRow.oldValue, newValue: selectedRow.newValue }, null, 2),
                        'payload'
                      )
                    }
                    className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedPayload ? 'Copiado' : 'Copiar JSON'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Old Value */}
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                      <span>Estado Anterior (Old Value)</span>
                    </div>
                    <pre className="text-[10px] font-mono text-gray-300 overflow-x-auto p-2 bg-black/50 rounded-lg max-h-48">
                      {selectedRow.oldValue != null
                        ? JSON.stringify(selectedRow.oldValue, null, 2)
                        : '(vazio / criação)'}
                    </pre>
                  </div>

                  {/* New Value */}
                  <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
                    <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                      <span>Novo Estado (New Value)</span>
                    </div>
                    <pre className="text-[10px] font-mono text-gray-300 overflow-x-auto p-2 bg-black/50 rounded-lg max-h-48">
                      {selectedRow.newValue != null
                        ? JSON.stringify(selectedRow.newValue, null, 2)
                        : '(vazio)'}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="pt-3 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setSelectedRow(null)}
                className="px-4 py-2 rounded-xl bg-white/10 text-white hover:bg-white/15 text-xs font-semibold transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
