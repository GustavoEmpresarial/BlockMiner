import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Copy, ExternalLink, Loader2, RefreshCw, ShieldAlert, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  approveWithdrawal,
  completeWithdrawal,
  listPendingWithdrawals,
  readAxiosResponseMessage,
  rejectWithdrawal,
} from '../lib/admin.api';

type WithdrawalRow = {
  id: number | string;
  userId?: number;
  amount?: number | string;
  address?: string | null;
  status?: string;
  type?: string;
  txHash?: string | null;
  createdAt?: string | null;
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
  switch (status) {
    case 'pending':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'approved':
      return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
    case 'processing':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-300';
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'failed':
    case 'rejected':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    default:
      return 'border-slate-500/30 bg-slate-500/10 text-slate-300';
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

function CopyChip({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => copy(value, label)}
      title={`Copiar ${label.toLowerCase()}`}
      className="group inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 font-mono text-[11px] text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200"
    >
      <span className="truncate">{shortHex(value)}</span>
      <Copy className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
    </button>
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
  tone?: 'amber' | 'emerald' | 'slate';
}) {
  const toneClass = tone === 'amber' ? 'text-amber-400' : tone === 'emerald' ? 'text-emerald-400' : 'text-slate-400';
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex items-center gap-2 text-slate-500">
        <Icon className={`h-4 w-4 ${toneClass}`} />
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs font-medium text-slate-500">{sub}</p> : null}
    </div>
  );
}

export default function AdminFinancePage() {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [txHash, setTxHash] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPendingWithdrawals();
      const data = res.data as { ok?: boolean; withdrawals?: WithdrawalRow[]; items?: WithdrawalRow[] };
      setRows(data.withdrawals ?? data.items ?? []);
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar saques');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const queuePolTotal = useMemo(
    () => queue.filter((w) => w.type !== 'shib_withdrawal').reduce((sum, w) => sum + (Number(w.amount) || 0), 0),
    [queue],
  );
  const failedCount = useMemo(() => history.filter((w) => String(w.status).toLowerCase() !== 'completed').length, [history]);

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
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = (w: WithdrawalRow) => {
    const status = String(w.status || '').toLowerCase();
    const id = String(w.id);
    const busy = busyId === id;

    if (status === 'pending') {
      return (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(w.id, () => approveWithdrawal(w.id), 'Aprovado')}
            className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-40"
          >
            Aprovar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(w.id, () => rejectWithdrawal(w.id), 'Rejeitado (saldo devolvido)')}
            className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-40"
          >
            Rejeitar
          </button>
        </div>
      );
    }

    if (status === 'approved' || status === 'processing') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={txHash[id] ?? ''}
            onChange={(e) => setTxHash((m) => ({ ...m, [id]: e.target.value }))}
            placeholder="tx hash (0x…)"
            disabled={busy}
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-xs text-white placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none disabled:opacity-40"
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
              void act(w.id, () => completeWithdrawal(w.id, hash), 'Marcado como enviado');
            }}
            className="rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-300 transition-colors hover:bg-sky-500/25 disabled:opacity-40"
          >
            Concluir
          </button>
          {status === 'approved' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(w.id, () => rejectWithdrawal(w.id), 'Rejeitado (saldo devolvido)')}
              className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-40"
            >
              Rejeitar
            </button>
          ) : null}
        </div>
      );
    }

    return null;
  };

  const renderQueueRow = (w: WithdrawalRow) => (
    <li key={String(w.id)} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-slate-700">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-sm font-bold text-amber-300">#{w.id}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass(w.status)}`}>
          {STATUS_LABEL[String(w.status).toLowerCase()] ?? w.status ?? '?'}
        </span>
        <span className="text-sm font-black text-white">
          {formatAmount(w.amount)} <span className="text-slate-500">{currencyLabel(w.type)}</span>
        </span>
        <span className="truncate text-xs font-medium text-slate-400">{userLabel(w)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {w.address ? <CopyChip value={w.address} label="Endereço" /> : null}
      </div>
      <div className="mt-3">{renderActions(w)}</div>
    </li>
  );

  return (
    <div className="animate-in fade-in space-y-8 duration-700">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Financeiro</h1>
          <p className="text-sm font-medium text-slate-500">Fila de saques e histórico de movimentações.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-slate-700"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Kpi icon={ShieldAlert} label="Fila ativa" value={String(queue.length)} sub="pendente / aprovado / processando" />
        <Kpi icon={Wallet} label="POL na fila" value={formatAmount(queuePolTotal)} sub="soma dos saques ativos" tone="emerald" />
        <Kpi
          icon={Coins}
          label="Histórico recente"
          value={String(history.length)}
          sub={failedCount > 0 ? `${failedCount} falhado(s) / rejeitado(s)` : 'todos concluídos'}
          tone="slate"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-amber-400/90">Fila (ação necessária)</h2>
            {queue.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/40 py-8 text-center text-sm text-slate-500">
                Nenhum saque pendente / aprovado / em processamento.
              </p>
            ) : (
              <ul className="space-y-3">{queue.map(renderQueueRow)}</ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Histórico recente (somente leitura)</h2>
            {history.length === 0 ? (
              <p className="rounded-2xl border border-slate-800 bg-slate-900/40 py-8 text-center text-sm text-slate-500">
                Sem histórico recente.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <th className="px-4 py-3 text-left">ID</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Valor</th>
                      <th className="px-4 py-3 text-left">Usuário</th>
                      <th className="px-4 py-3 text-left">Endereço</th>
                      <th className="px-4 py-3 text-left">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((w) => (
                      <tr key={String(w.id)} className="border-b border-slate-800/60 transition-colors last:border-0 hover:bg-slate-800/30">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-amber-300">#{w.id}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass(w.status)}`}>
                            {STATUS_LABEL[String(w.status).toLowerCase()] ?? w.status ?? '?'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-white">
                          {formatAmount(w.amount)} <span className="text-slate-500">{currencyLabel(w.type)}</span>
                        </td>
                        <td className="max-w-[14rem] truncate px-4 py-3 text-xs text-slate-400">{userLabel(w)}</td>
                        <td className="px-4 py-3">{w.address ? <CopyChip value={w.address} label="Endereço" /> : '—'}</td>
                        <td className="px-4 py-3">
                          {w.txHash ? (
                            <div className="flex items-center gap-1.5">
                              <CopyChip value={w.txHash} label="Tx hash" />
                              <a
                                href={`https://polygonscan.com/tx/${w.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Ver no explorer"
                                className="text-slate-500 transition-colors hover:text-slate-300"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
