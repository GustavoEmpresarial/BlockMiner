import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
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
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(w.id, () => approveWithdrawal(w.id), 'Aprovado')}
            className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 disabled:opacity-40"
          >
            Aprovar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(w.id, () => rejectWithdrawal(w.id), 'Rejeitado (saldo devolvido)')}
            className="rounded-lg bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300 disabled:opacity-40"
          >
            Rejeitar
          </button>
        </div>
      );
    }

    if (status === 'approved' || status === 'processing') {
      return (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={txHash[id] ?? ''}
            onChange={(e) => setTxHash((m) => ({ ...m, [id]: e.target.value }))}
            placeholder="tx hash (0x…)"
            disabled={busy}
            className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs text-white disabled:opacity-40"
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
            className="rounded-lg bg-sky-500/20 px-3 py-1 text-xs font-bold text-sky-300 disabled:opacity-40"
          >
            Concluir
          </button>
          {status === 'approved' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(w.id, () => rejectWithdrawal(w.id), 'Rejeitado (saldo devolvido)')}
              className="rounded-lg bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300 disabled:opacity-40"
            >
              Rejeitar
            </button>
          ) : null}
        </div>
      );
    }

    return w.txHash ? (
      <p className="mt-2 break-all font-mono text-[11px] text-slate-500">tx: {w.txHash}</p>
    ) : null;
  };

  const renderRow = (w: WithdrawalRow) => (
    <li key={String(w.id)} className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-amber-300">#{w.id}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${statusClass(w.status)}`}>
          {w.status || '?'}
        </span>
        <span className="font-bold text-white">
          {formatAmount(w.amount)} {currencyLabel(w.type)}
        </span>
        <span className="text-slate-400">{userLabel(w)}</span>
      </div>
      <p className="mt-1 break-all font-mono text-xs text-slate-500">{w.address || '—'}</p>
      {renderActions(w)}
    </li>
  );

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Financeiro</h1>
          <p className="text-sm text-slate-500">
            Fila de saques · {queue.length} ativo{queue.length === 1 ? '' : 's'}
            {history.length > 0 ? ` · ${history.length} no histórico recente` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      {loading ? (
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-amber-400/90">Fila (ação necessária)</h2>
            {queue.length === 0 ? (
              <p className="text-slate-500">Nenhum saque pendente / aprovado / em processamento.</p>
            ) : (
              <ul className="space-y-3">{queue.map(renderRow)}</ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Histórico recente (somente leitura)</h2>
            {history.length === 0 ? (
              <p className="text-slate-600 text-sm">Sem histórico recente.</p>
            ) : (
              <ul className="space-y-3 opacity-90">{history.map(renderRow)}</ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
