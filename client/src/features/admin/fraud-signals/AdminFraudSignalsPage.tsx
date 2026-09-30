import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  RefreshCw,
  Search,
  Filter,
  Users,
  Wallet,
  Globe,
  Fingerprint,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Copy,
  Check,
  Trash2,
  X,
  Loader2,
  Shield,
  ShieldCheck,
  Activity,
  UserCheck,
  AlertOctagon,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminFraudSignalsApi } from './adminFraudSignals.api';
import type {
  FraudCluster,
  FraudScope,
  FraudSignalsResponse,
} from './adminFraudSignals.types';

const RISK_BADGES: Record<string, { label: string; badge: string }> = {
  critical: { label: 'Crítico', badge: 'border-red-500/40 bg-red-500/15 text-red-300' },
  high: { label: 'Alto', badge: 'border-orange-500/40 bg-orange-500/15 text-orange-300' },
  medium: { label: 'Médio', badge: 'border-amber-500/40 bg-amber-500/15 text-amber-300' },
  low: { label: 'Baixo', badge: 'border-sky-500/40 bg-sky-500/15 text-sky-300' },
};

export default function AdminFraudSignalsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FraudSignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(40);
  const [scope, setScope] = useState<FraudScope>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [expandedClusters, setExpandedClusters] = useState<Record<string, boolean>>({});
  const [refreshingIp, setRefreshingIp] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmPhrase, setResetConfirmPhrase] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFraudSignalsApi.listSignals({
        scope,
        page,
        limit,
        q: search || undefined,
      });
      setData(res.data);
    } catch {
      toast.error('Erro ao carregar sinais de fraude.');
    } finally {
      setLoading(false);
    }
  }, [scope, page, limit, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSearchSubmit = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleKeyDownSearch = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const toggleClusterExpand = (clusterId: string) => {
    setExpandedClusters((prev) => ({ ...prev, [clusterId]: !prev[clusterId] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success('Copiado para a área de transferência!');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRefreshIp = async (ip: string) => {
    setRefreshingIp(ip);
    try {
      const res = await adminFraudSignalsApi.refreshIp(ip, true);
      if (res.data.ok) {
        toast.success(`Inteligência de rede atualizada para ${ip}!`);
        void load();
      }
    } catch {
      toast.error(`Erro ao atualizar IP ${ip}`);
    } finally {
      setRefreshingIp(null);
    }
  };

  const handleResetCollection = async () => {
    if (resetConfirmPhrase.trim() !== 'RESET_FRAUD_COLLECTION') {
      toast.error('Frase de confirmação incorreta.');
      return;
    }
    setResetting(true);
    try {
      const res = await adminFraudSignalsApi.resetCollection(resetConfirmPhrase.trim());
      if (res.data.ok) {
        toast.success(`Base limpa! ${res.data.ipLogsDeleted} logs de IP e ${res.data.ipIntelDeleted} caches removidos.`);
        setResetModalOpen(false);
        setResetConfirmPhrase('');
        void load();
      }
    } catch {
      toast.error('Erro ao limpar dados de coleta anti-fraude.');
    } finally {
      setResetting(false);
    }
  };

  // KPIs
  const clusters = data?.signals ?? [];
  const totalClusters = data?.total ?? 0;
  const criticalCount = clusters.filter((c) => c.riskLevel === 'critical' || c.riskLevel === 'high').length;
  const affectedUsersCount = clusters.reduce((acc, c) => acc + c.userCount, 0);

  const getSignalIcon = (signalType: string) => {
    switch (signalType) {
      case 'wallet':
        return <Wallet className="w-4 h-4 text-emerald-400" />;
      case 'registration_ip':
      case 'last_ip':
      case 'ip_log':
        return <Globe className="w-4 h-4 text-sky-400" />;
      case 'device_fingerprint':
        return <Fingerprint className="w-4 h-4 text-purple-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    }
  };

  const getSignalTypeLabel = (signalType: string) => {
    switch (signalType) {
      case 'wallet':
        return 'Carteira On-Chain Duplicada';
      case 'registration_ip':
        return 'IP de Cadastro Compartilhado';
      case 'last_ip':
        return 'Último IP Compartilhado';
      case 'ip_log':
        return 'Histórico de Conexão (IP Log)';
      case 'device_fingerprint':
        return 'Fingerprint de Dispositivo';
      default:
        return signalType;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ─── Top Header ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                Sinais de Fraude &amp; Multi-Contas
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Cluster Risk Engine
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5 max-w-xl">
                Agrupamento inteligente de contas correlacionadas por carteiras, histórico de IPs e fingerprints de dispositivos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition-all shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-bold hover:bg-rose-500/20 transition-all shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Resetar Coleta
            </button>
          </div>
        </div>

        {/* ─── KPI Stats ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <Users className="w-3.5 h-3.5 text-sky-400" />
              Total de Clusters
            </div>
            <div className="text-2xl font-black text-white mt-1">{totalClusters}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              Clusters de Alto Risco
            </div>
            <div className="text-2xl font-black text-rose-400 mt-1">{criticalCount}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              Contas no Escopo
            </div>
            <div className="text-2xl font-black text-white mt-1">{affectedUsersCount}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
            <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              Escopo Ativo
            </div>
            <div className="text-2xl font-black text-purple-400 mt-1 uppercase text-sm font-mono pt-1">
              {scope}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Controls Bar: Scope Tabs & Search ───────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md">
        {/* Scope Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold scrollbar-none">
          <button
            type="button"
            onClick={() => { setScope('all'); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
              scope === 'all'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Todos os Sinais
          </button>
          <button
            type="button"
            onClick={() => { setScope('wallets'); setPage(1); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
              scope === 'wallets'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            Carteiras
          </button>
          <button
            type="button"
            onClick={() => { setScope('ips'); setPage(1); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
              scope === 'ips'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Endereços IP
          </button>
          <button
            type="button"
            onClick={() => { setScope('devices'); setPage(1); }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
              scope === 'devices'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
            Dispositivos
          </button>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2 w-full md:w-80">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por IP, carteira, usuário..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleKeyDownSearch}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearchSubmit}
            className="px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 hover:bg-slate-700 transition-colors shrink-0"
          >
            Buscar
          </button>
        </div>
      </div>

      {/* ─── Clusters List ─────────────────────────────────────────── */}
      <div className="space-y-4">
        {loading && clusters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
            <p className="text-xs font-bold">Analisando clusters e calculando scores de risco...</p>
          </div>
        ) : clusters.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-500 space-y-2">
            <ShieldCheck className="w-10 h-10 text-emerald-400/60 mx-auto" />
            <h3 className="text-sm font-bold text-white">Nenhum cluster de fraude encontrado</h3>
            <p className="text-xs max-w-sm mx-auto">
              Não foram identificadas colisões de multi-contas no escopo selecionado.
            </p>
          </div>
        ) : (
          clusters.map((cluster) => {
            const isExpanded = Boolean(expandedClusters[cluster.id]);
            const badgeCfg = RISK_BADGES[cluster.riskLevel] ?? RISK_BADGES.low;
            const isIpCluster = ['registration_ip', 'last_ip', 'ip_log'].includes(cluster.signalType);

            return (
              <div
                key={cluster.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm overflow-hidden transition-all hover:border-slate-700"
              >
                {/* Cluster Card Header */}
                <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 shrink-0 mt-0.5">
                      {getSignalIcon(cluster.signalType)}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {getSignalTypeLabel(cluster.signalType)}
                        </span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${badgeCfg.badge}`}>
                          {badgeCfg.label} ({cluster.riskScore}/100)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {cluster.userCount} contas conectadas
                        </span>
                      </div>

                      {/* Cluster Key (Address, IP or Fingerprint) */}
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white break-all">
                          {cluster.key}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(cluster.key, cluster.id)}
                          className="text-slate-400 hover:text-white transition-colors"
                          title="Copiar identificador"
                        >
                          {copiedKey === cluster.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Reasons & Identity vectors */}
                      {cluster.reasons && cluster.reasons.length > 0 && (
                        <div className="text-xs text-slate-400 space-y-0.5 pt-1">
                          {cluster.reasons.slice(0, 2).map((reason, i) => (
                            <p key={i} className="flex items-center gap-1.5 text-[11px]">
                              <span className="w-1 h-1 rounded-full bg-amber-400 inline-block" />
                              {reason}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* False Positive Warnings */}
                      {cluster.falsePositiveWarnings && cluster.falsePositiveWarnings.length > 0 && (
                        <div className="text-[11px] text-amber-300/80 italic pt-0.5">
                          Aviso: {cluster.falsePositiveWarnings.join(' ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions for this cluster */}
                  <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-center">
                    {isIpCluster && (
                      <button
                        type="button"
                        onClick={() => void handleRefreshIp(cluster.key)}
                        disabled={refreshingIp === cluster.key}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors disabled:opacity-50"
                        title="Consultar provedor de ASN/Proxy para este IP"
                      >
                        <RefreshCw className={`w-3 h-3 ${refreshingIp === cluster.key ? 'animate-spin' : ''}`} />
                        <span>Atualizar IP</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleClusterExpand(cluster.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors"
                    >
                      <span>{isExpanded ? 'Recolher Contas' : `Ver Contas (${cluster.userCount})`}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Users Table */}
                {isExpanded && (
                  <div className="border-t border-slate-800/80 bg-slate-950/60 p-4 sm:p-5 animate-in fade-in duration-200 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                      <span>Contas que compõem este cluster:</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        Ação recomendada pelo motor: <strong className="text-amber-300">{cluster.decision.recommendedAction}</strong>
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/90 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                          <tr>
                            <th className="p-3">Usuário</th>
                            <th className="p-3">E-mail</th>
                            <th className="p-3">Carteira Registrada</th>
                            <th className="p-3">Criado em</th>
                            <th className="p-3 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {cluster.users.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="p-3 font-bold text-white flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-300">
                                  {u.username ? u.username[0].toUpperCase() : 'U'}
                                </div>
                                <span>{u.username ?? `Usuário #${u.id}`}</span>
                              </td>
                              <td className="p-3 text-slate-300 font-mono text-[11px]">{u.email}</td>
                              <td className="p-3 text-slate-400 font-mono text-[11px]">
                                {u.walletAddress ? (
                                  <span className="truncate max-w-[180px] inline-block">{u.walletAddress}</span>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </td>
                              <td className="p-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                                {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="p-3 text-right">
                                <Link
                                  to={`/admin/antibot/users/${u.id}`}
                                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 hover:text-amber-300"
                                >
                                  <span>Dossiê</span>
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ─── Pagination Controls ───────────────────────────────────── */}
      {totalClusters > limit && (
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs font-bold">
          <span className="text-slate-500">
            Mostrando página {page} de {Math.max(1, Math.ceil(totalClusters / limit))} ({totalClusters} clusters)
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <button
              type="button"
              disabled={page * limit >= totalClusters}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-40"
            >
              Próxima
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Reset Confirmation Modal ───────────────────────────────── */}
      {resetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">Resetar Coleta de Fraude</h3>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Esta ação <strong className="text-rose-400">apagará todos os registros de histórico de conexão (IP logs)</strong> e
              o cache de ASN/Proxy, limpando os IPs de cadastro dos perfis.
              As contas, carteiras e saldos <strong className="text-white">não serão afetados</strong>.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase">
                Digite <span className="font-mono text-amber-400">RESET_FRAUD_COLLECTION</span> para confirmar:
              </label>
              <input
                type="text"
                placeholder="RESET_FRAUD_COLLECTION"
                value={resetConfirmPhrase}
                onChange={(e) => setResetConfirmPhrase(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-rose-500/60"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                disabled={resetting}
                className="px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleResetCollection()}
                disabled={resetting || resetConfirmPhrase.trim() !== 'RESET_FRAUD_COLLECTION'}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-500 bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-lg shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Confirmar Limpeza
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
