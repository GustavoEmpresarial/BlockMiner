import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  User as UserIcon,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  approveWithdrawal,
  completeWithdrawal,
  fetchAdminHotWalletStatus,
  listPendingWithdrawals,
  readAxiosResponseMessage,
  rejectWithdrawal,
} from '../lib/admin.api';
import type { AdminHotWalletStatus } from './adminFinance.types';
import { HotWalletStatusPanel } from './components/HotWalletStatusPanel';

type WithdrawalRow = {
  id: number | string;
  userId?: number;
  amount?: number | string;
  address?: string | null;
  status?: string;
  type?: string;
  txHash?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  completedAt?: string | null;
  completed_at?: string | null;
  user?: { username?: string | null; email?: string | null; name?: string | null };
};

const QUEUE_STATUSES = new Set(['pending', 'approved', 'processing']);
const HISTORY_STATUSES = new Set(['completed', 'failed', 'rejected']);

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  processing: 'Processando',
  completed: 'Concluído',
  failed: 'Falhou',
  rejected: 'Rejeitado',
};

function currencyLabel(type?: string): string {
  return type === 'shib_withdrawal' ? 'SHIB' : 'POL';
}

function statusClass(status?: string): string {
  switch (String(status).toLowerCase()) {
    case 'pending':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-300';
    case 'approved':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-300';
    case 'processing':
      return 'border-violet-500/30 bg-violet-500/15 text-violet-300';
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
    case 'failed':
    case 'rejected':
      return 'border-red-500/30 bg-red-500/15 text-red-300';
    default:
      return 'border-slate-500/30 bg-slate-500/15 text-slate-300';
  }
}

function formatAmount(amount: number | string | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? '—');
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 8 });
}

function userLabel(w: WithdrawalRow): string {
  return w.user?.email || w.user?.username || w.user?.name || `user ${w.userId ?? '?'}`;
}

function shortHex(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function copy(value: string, label: string) {
  void navigator.clipboard.writeText(value);
  toast.success(`${label} copiado`);
}

function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateLocal(d: Date): string {
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateUtc(d: Date): string {
  return (
    d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

function formatRelativeTime(d: Date, now = Date.now()): string {
  const diffMs = now - d.getTime();
  if (diffMs < 0) return 'agora';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s atrás`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const days = Math.floor(h / 24);
  if (days === 1) return '1 dia atrás';
  return `${days} dias atrás`;
}

function CopyChip({
  value,
  label,
  explorerUrl,
}: {
  value: string;
  label: string;
  explorerUrl?: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-1 text-xs">
      <button
        type="button"
        onClick={() => copy(value, label)}
        title={`Copiar ${label.toLowerCase()}`}
        className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[11px] text-slate-300 transition-colors hover:bg-slate-800/80 hover:text-white"
      >
        <span className="truncate">{shortHex(value)}</span>
        <Copy className="h-3 w-3 shrink-0 opacity-50 transition-opacity group-hover:opacity-100" />
      </button>

      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          title="Ver no PolygonScan"
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-sky-400"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'amber',
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  sub?: string;
  tone?: 'amber' | 'emerald' | 'slate' | 'violet';
}) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber-400'
      : tone === 'emerald'
      ? 'text-emerald-400'
      : tone === 'violet'
      ? 'text-violet-400'
      : 'text-slate-400';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950 p-5 shadow-lg">
      <div className="mb-3 flex items-center gap-2 text-slate-400">
        <div className="rounded-xl border border-white/5 bg-slate-800/60 p-2">
          <Icon className={`h-4 w-4 ${toneClass}`} />
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {label}
        </span>
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs font-medium text-slate-400">{sub}</p> : null}
    </div>
  );
}

export default function AdminFinancePage() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [txHash, setTxHash] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [rejectModalTarget, setRejectModalTarget] = useState<WithdrawalRow | null>(null);
  const [hotWallet, setHotWallet] = useState<AdminHotWalletStatus | null>(null);
  const [hotWalletLoading, setHotWalletLoading] = useState(false);

  const loadHotWallet = useCallback(async () => {
    setHotWalletLoading(true);
    try {
      const res = await fetchAdminHotWalletStatus();
      if (res.data.ok && res.data.hotWallet) {
        setHotWallet(res.data.hotWallet);
      }
    } catch {
      // Non-blocking: failure to fetch hot wallet status does not prevent queue review
    } finally {
      setHotWalletLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resWithdrawals] = await Promise.all([
        listPendingWithdrawals(),
        loadHotWallet(),
      ]);
      const data = resWithdrawals.data as { ok?: boolean; withdrawals?: WithdrawalRow[] };
      setRows(data.withdrawals ?? []);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar saques');
    } finally {
      setLoading(false);
    }
  }, [loadHotWallet]);

  useEffect(() => {
    void load();
  }, [load]);

  const queue = useMemo(
    () => rows.filter((w) => QUEUE_STATUSES.has(String(w.status || '').toLowerCase())),
    [rows],
  );

  const history = useMemo(
    () => rows.filter((w) => HISTORY_STATUSES.has(String(w.status || '').toLowerCase())),
    [rows],
  );

  const filteredQueue = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return queue;
    return queue.filter((w) => {
      const idStr = String(w.id);
      const email = String(w.user?.email || '').toLowerCase();
      const name = String(w.user?.name || '').toLowerCase();
      const addr = String(w.address || '').toLowerCase();
      return (
        idStr.includes(q) ||
        email.includes(q) ||
        name.includes(q) ||
        addr.includes(q)
      );
    });
  }, [queue, searchTerm]);

  const filteredHistory = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return history;
    return history.filter((w) => {
      const idStr = String(w.id);
      const email = String(w.user?.email || '').toLowerCase();
      const name = String(w.user?.name || '').toLowerCase();
      const addr = String(w.address || '').toLowerCase();
      const tx = String(w.txHash || '').toLowerCase();
      return (
        idStr.includes(q) ||
        email.includes(q) ||
        name.includes(q) ||
        addr.includes(q) ||
        tx.includes(q)
      );
    });
  }, [history, searchTerm]);

  const queuePolTotal = useMemo(
    () =>
      queue
        .filter((w) => w.type !== 'shib_withdrawal')
        .reduce((sum, w) => sum + (Number(w.amount) || 0), 0),
    [queue],
  );

  const queueShibTotal = useMemo(
    () =>
      queue
        .filter((w) => w.type === 'shib_withdrawal')
        .reduce((sum, w) => sum + (Number(w.amount) || 0), 0),
    [queue],
  );

  const failedCount = useMemo(
    () => history.filter((w) => String(w.status).toLowerCase() !== 'completed').length,
    [history],
  );

  const act = async (id: string | number, fn: () => Promise<unknown>, okMsg: string) => {
    const key = String(id);
    if (busyId) return;
    setBusyId(key);
    try {
      await fn();
      toast.success(okMsg);
      void load();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro');
      void load();
    } finally {
      setBusyId(null);
    }
  };

  const renderQueueRow = (w: WithdrawalRow) => {
    const status = String(w.status || '').toLowerCase();
    const id = String(w.id);
    const busy = busyId === id;
    const reqDate = parseDate(w.createdAt ?? w.created_at);
    const curr = currencyLabel(w.type);
    const explorerUrl = w.address ? `https://polygonscan.com/address/${w.address}` : undefined;

    const isOld = reqDate ? Date.now() - reqDate.getTime() > 24 * 60 * 60 * 1000 : false;
    const isVeryOld = reqDate ? Date.now() - reqDate.getTime() > 48 * 60 * 60 * 1000 : false;

    return (
      <li
        key={id}
        className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg transition-all hover:border-slate-700 hover:bg-slate-900/90"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          {/* Lado Esquerdo: Identificação, Status e Valor */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-black text-amber-300">#{w.id}</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass(
                  w.status
                )}`}
              >
                {status === 'pending' && <Clock className="h-3 w-3 animate-pulse" />}
                {STATUS_LABEL[status] ?? w.status ?? '?'}
              </span>

              {reqDate && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    isVeryOld
                      ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                      : isOld
                      ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : 'border border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  {formatRelativeTime(reqDate)}
                </span>
              )}
            </div>

            {/* Valor do saque em destaque */}
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-white">
                {formatAmount(w.amount)}
              </span>
              <span className="rounded-lg border border-white/10 bg-slate-800/80 px-2 py-0.5 text-xs font-black text-amber-400">
                {curr}
              </span>
            </div>

            {/* Usuário solicitante */}
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <UserIcon className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-bold text-white">
                {w.user?.name || w.user?.username || 'Usuário'}
              </span>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-slate-400">{w.user?.email || `ID #${w.userId}`}</span>
            </div>
          </div>

          {/* Lado Direito: Detalhes de Data/Hora (Local e UTC) */}
          {reqDate && (
            <div className="flex flex-col rounded-xl border border-white/5 bg-slate-950/60 p-3 sm:text-right">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 sm:justify-end">
                <Calendar className="h-3.5 w-3.5 text-orange-400" />
                <span>Solicitado em:</span>
              </div>
              <p className="mt-1 font-mono text-xs font-black text-white">
                {formatDateLocal(reqDate)}
              </p>
              <p className="font-mono text-[11px] text-slate-400">
                {formatDateUtc(reqDate)}
              </p>
            </div>
          )}
        </div>

        {/* Endereço da carteira */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
          <span className="text-xs font-bold text-slate-500">Carteira de Destino:</span>
          {w.address ? (
            <CopyChip value={w.address} label="Endereço" explorerUrl={explorerUrl} />
          ) : (
            <span className="text-xs text-slate-600">Não informado</span>
          )}
        </div>

        {/* Ações */}
        <div className="mt-4 border-t border-white/5 pt-3">
          {status === 'pending' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(w.id, () => approveWithdrawal(w.id), 'Saque aprovado!')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 px-4 py-2 text-xs font-black text-emerald-300 transition-all hover:bg-emerald-500/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Aprovar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setRejectModalTarget(w)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-2 text-xs font-black text-red-300 transition-all hover:bg-red-500/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <XCircle className="h-3.5 w-3.5" />
                Rejeitar
              </button>
            </div>
          )}

          {(status === 'approved' || status === 'processing') && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/20 bg-sky-500/10 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
                  <Zap className="h-4 w-4 shrink-0 animate-pulse text-sky-400" />
                  <span>
                    {status === 'processing'
                      ? 'Processando envio on-chain na rede Polygon agora…'
                      : 'Aprovado para Auto-Send — envio on-chain automático a cada ciclo de 2 min.'}
                  </span>
                </div>
                {status === 'approved' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRejectModalTarget(w)}
                    className="rounded-lg border border-red-500/30 bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-40"
                  >
                    Rejeitar / Estornar
                  </button>
                )}
              </div>

              <details className="group text-xs">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-300 font-semibold select-none flex items-center gap-1.5">
                  <span>Opção manual: informar txHash externo manualmente</span>
                </summary>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <input
                    value={txHash[id] ?? ''}
                    onChange={(e) => setTxHash((m) => ({ ...m, [id]: e.target.value }))}
                    placeholder="txHash externo (0x…)"
                    disabled={busy}
                    className="min-w-[15rem] flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-white placeholder:text-slate-600 focus:border-sky-500/60 focus:outline-none disabled:opacity-40"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const hash = txHash[id]?.trim();
                      if (!hash) {
                        toast.error('Informe o tx hash');
                        return;
                      }
                      void act(w.id, () => completeWithdrawal(w.id, hash), 'Saque marcado como concluído!');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500/20 border border-sky-500/30 px-4 py-2 text-xs font-black text-sky-300 hover:bg-sky-500/30 transition-all active:scale-95 disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    Concluir Manualmente
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="animate-in fade-in space-y-8 duration-700">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Gestão Financeira</h1>
          <p className="text-sm font-medium text-slate-400">
            Fila de saques com data/hora (Local e UTC), histórico e auditoria.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 shadow-md transition-all hover:bg-slate-700 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </header>

      {/* Painel de Status da Hot Wallet & Auto-Send */}
      <HotWalletStatusPanel
        status={hotWallet}
        loading={hotWalletLoading}
        onRefresh={() => void loadHotWallet()}
      />

      {/* Cards de Métricas (KPIs) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          icon={ShieldAlert}
          label="Fila Ativa"
          value={String(queue.length)}
          sub="pendente / aprovado / processando"
          tone={queue.length > 0 ? 'amber' : 'slate'}
        />
        <Kpi
          icon={Wallet}
          label="POL na Fila"
          value={`${formatAmount(queuePolTotal)} POL`}
          sub={queueShibTotal > 0 ? `+ ${formatAmount(queueShibTotal)} SHIB` : 'soma dos saques ativos'}
          tone="emerald"
        />
        <Kpi
          icon={Coins}
          label="Histórico Recente"
          value={String(history.length)}
          sub={failedCount > 0 ? `${failedCount} falhado(s) ou rejeitado(s)` : 'todos concluídos'}
          tone="slate"
        />
      </div>

      {/* Barra de Filtro e Busca Rápida */}
      <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-2">
        <Search className="ml-2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar saque por #ID, e-mail do usuário ou carteira..."
          className="w-full bg-transparent px-2 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="rounded-lg p-1 text-xs text-slate-400 hover:text-white"
          >
            Limpar
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
        </div>
      ) : (
        <>
          {/* Seção da Fila de Ação */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-400">
                <Clock className="h-4 w-4" />
                Fila de Saques (Ação Necessária) ({filteredQueue.length})
              </h2>
            </div>

            {filteredQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/30 py-12 text-center text-slate-500">
                <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500/40" />
                <p className="text-sm font-bold text-slate-400">
                  {searchTerm
                    ? 'Nenhum saque pendente corresponde aos termos da busca.'
                    : 'Tudo em dia! Nenhum saque aguardando ação.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-3.5">{filteredQueue.map(renderQueueRow)}</ul>
            )}
          </section>

          {/* Seção do Histórico Recente */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
              <Coins className="h-4 w-4" />
              Histórico Recente ({filteredHistory.length})
            </h2>

            {filteredHistory.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/30 py-8 text-center text-sm text-slate-500">
                {searchTerm ? 'Nenhum registro encontrado para esta busca.' : 'Sem histórico recente.'}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40 shadow-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-950/60">
                      <th className="px-4 py-3 text-left">ID</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Valor</th>
                      <th className="px-4 py-3 text-left">Usuário</th>
                      <th className="px-4 py-3 text-left">Solicitado em (Local / UTC)</th>
                      <th className="px-4 py-3 text-left">Finalizado em</th>
                      <th className="px-4 py-3 text-left">Endereço</th>
                      <th className="px-4 py-3 text-left">Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredHistory.map((w) => {
                      const reqDate = parseDate(w.createdAt ?? w.created_at);
                      const finDate = parseDate(
                        w.completedAt ?? w.completed_at ?? w.updatedAt ?? w.updated_at
                      );
                      const curr = currencyLabel(w.type);
                      const explorerAddr = w.address
                        ? `https://polygonscan.com/address/${w.address}`
                        : undefined;

                      return (
                        <tr
                          key={String(w.id)}
                          className="transition-colors hover:bg-slate-800/40"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-bold text-amber-300">
                            #{w.id}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass(
                                w.status
                              )}`}
                            >
                              {STATUS_LABEL[String(w.status).toLowerCase()] ?? w.status ?? '?'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-white">
                            {formatAmount(w.amount)}{' '}
                            <span className="font-normal text-slate-500">{curr}</span>
                          </td>
                          <td className="max-w-[14rem] truncate px-4 py-3 text-xs text-slate-300">
                            <p className="font-bold text-white truncate">
                              {w.user?.name || w.user?.username || '—'}
                            </p>
                            <p className="font-mono text-[11px] text-slate-400 truncate">
                              {w.user?.email || `ID #${w.userId}`}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs">
                            {reqDate ? (
                              <div>
                                <p className="font-mono font-bold text-slate-200">
                                  {formatDateLocal(reqDate)}
                                </p>
                                <p className="font-mono text-[10px] text-slate-500">
                                  {formatDateUtc(reqDate)}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs">
                            {finDate ? (
                              <span className="font-mono text-slate-300">
                                {formatDateLocal(finDate)}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {w.address ? (
                              <CopyChip
                                value={w.address}
                                label="Endereço"
                                explorerUrl={explorerAddr}
                              />
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {w.txHash ? (
                              <CopyChip
                                value={w.txHash}
                                label="Tx hash"
                                explorerUrl={`https://polygonscan.com/tx/${w.txHash}`}
                              />
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal de Confirmação de Rejeição */}
      {rejectModalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setRejectModalTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-red-500/30 bg-slate-950 p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/20">
                <AlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <p className="text-lg font-black text-white">Rejeitar Saque #{rejectModalTarget.id}</p>
                <p className="text-xs text-slate-400">Esta ação devolverá o saldo ao usuário.</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-slate-900/70 p-3.5 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Valor a estornar:</span>
                <span className="font-bold text-white">
                  {formatAmount(rejectModalTarget.amount)} {currencyLabel(rejectModalTarget.type)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Usuário:</span>
                <span className="font-mono text-slate-300">
                  {rejectModalTarget.user?.email || `User #${rejectModalTarget.userId}`}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalTarget(null)}
                className="flex-1 rounded-xl border border-white/10 py-2.5 text-xs font-bold text-slate-300 transition-colors hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = rejectModalTarget;
                  setRejectModalTarget(null);
                  void act(
                    target.id,
                    () => rejectWithdrawal(target.id),
                    'Saque rejeitado e saldo estornado com sucesso!'
                  );
                }}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-xs font-black text-white transition-colors hover:bg-red-400"
              >
                Confirmar Rejeição
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
