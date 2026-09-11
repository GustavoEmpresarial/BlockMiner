import { type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import {
  Activity, Ban, ChevronLeft, ChevronRight, Copy, Cpu, ExternalLink, Eye, EyeOff,
  Fingerprint, KeyRound, Loader2, Minus, Package, Plus, RefreshCw, Search, Send,
  ShieldCheck, Terminal, UserRound, Wallet, X,
} from 'lucide-react';
import { formatHashrate } from '../../../../shared/utils/machine';
import AntibotTab from '../AntibotTab';
import type {
    LucideIc,
    IpIntel,
    AdminUsersListRow,
    PolygonHd,
    AdminDossierUser,
    AdminDossierMetrics,
    AdminUserDetailsPayload,
    UsersListApiResponse,
    MinerCatalogRow,
    MinersCatalogResponse,
    TransactionRow,
    LogRow,
    TicketRow,
    MachineRow,
    RelatedUserRow,
    RelatedUserWithRel,
    ReferralRow,
    RelatedDataPayload,
    TabData,
    AdminUsersTabSlice,
    TabStateMap,
} from '../adminUsers.types';

import {
  Badge,
  CopyButton,
  DetailCard,
  ExplorerLink,
  FILTERS,
  MetaBlock,
  ResetPasswordModal,
  SORTS,
  TxHashLink,
} from './adminUsersParts.controls';
import {
  AdjustBalanceModal,
  BALANCE_FIELDS,
  ProfileTab,
} from './adminUsersParts.balance';

export function TabToolbar({
  state,
  onLoad,
  children,
}: {
  state: AdminUsersTabSlice | undefined;
  onLoad: (o: Partial<AdminUsersTabSlice>) => void;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row">
      <input
        value={state?.q || ''}
        onChange={(e) => onLoad({ q: e.target.value, page: 1 })}
        placeholder="Buscar nesta aba..."
        className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
        maxLength={140}
      />
      {children}
    </div>
  );
}

export function Pager({
  state,
  total,
  onLoad,
}: {
  state: AdminUsersTabSlice | undefined;
  total: number | undefined;
  onLoad: (o: Partial<AdminUsersTabSlice>) => void;
}) {
  const page = Number(state?.page || 1);
  const hasNext = page * 25 < Number(total || 0);
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" disabled={page <= 1} onClick={() => onLoad({ page: page - 1 })} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40">
        Anterior
      </button>
      <button type="button" disabled={!hasNext} onClick={() => onLoad({ page: page + 1 })} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40">
        Próxima
      </button>
    </div>
  );
}

export function LoadingOrEmpty({
  state,
  rows,
  children,
}: {
  state: AdminUsersTabSlice | undefined;
  rows: unknown[] | undefined;
  children: ReactNode;
}) {
  if (state?.loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
      </div>
    );
  if (!rows?.length) return <div className="rounded-2xl border border-slate-800 p-12 text-center text-slate-500">Nenhum registro encontrado.</div>;
  return children;
}

export function TransactionsTab({
  state = {},
  onLoad,
}: {
  state?: AdminUsersTabSlice;
  onLoad: (o: Partial<AdminUsersTabSlice>) => void;
}) {
  const rows: TransactionRow[] = state.data?.transactions || [];
  return (
    <div>
      <TabToolbar state={state} onLoad={onLoad}>
        <select value={state.type || 'all'} onChange={(e) => onLoad({ type: e.target.value, page: 1 })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
          {['all', 'deposit', 'withdrawal', 'reward', 'faucet', 'purchase', 'mining', 'referral', 'adjustment'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select value={state.status || 'all'} onChange={(e) => onLoad({ status: e.target.value, page: 1 })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
          {['all', 'pending', 'completed', 'failed', 'canceled', 'approved'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </TabToolbar>
      <LoadingOrEmpty state={state} rows={rows}>
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-400">
            <thead className="bg-slate-800/40 text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Status</th>
                <th className="p-3">Hash</th>
                <th className="p-3">Wallets</th>
                <th className="p-3">Data</th>
                <th className="p-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((tx) => (
                <tr key={tx.id}>
                  <td className="p-3 font-mono">
                    #{tx.id}
                    <CopyButton value={tx.id} />
                  </td>
                  <td className="p-3">{tx.type}</td>
                  <td className="p-3 text-amber-300">{Number(tx.amount || 0).toFixed(6)}</td>
                  <td className="p-3">{tx.status}</td>
                  <td className="p-3">
                    <TxHashLink hash={tx.txHash} />
                  </td>
                  <td className="p-3 max-w-[220px]">
                    <p className="truncate font-mono">
                      de: {tx.fromAddress || '--'}
                      <CopyButton value={tx.fromAddress} />
                    </p>
                    <p className="truncate font-mono">
                      para: {tx.toAddress || '--'}
                      <CopyButton value={tx.toAddress} />
                    </p>
                  </td>
                  <td className="p-3">{tx.createdAt ? new Date(tx.createdAt).toLocaleString('pt-BR') : '—'}</td>
                  <td className="p-3">
                    <MetaBlock value={tx.metadata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LoadingOrEmpty>
      <Pager state={state} total={state?.data?.total} onLoad={onLoad} />
    </div>
  );
}

export function LogsTab({ state = {}, onLoad }: { state?: AdminUsersTabSlice; onLoad: (o: Partial<AdminUsersTabSlice>) => void }) {
  const rows: LogRow[] = state.data?.logs || [];
  return (
    <div>
      <TabToolbar state={state} onLoad={onLoad}>
        <select value={state.source || 'all'} onChange={(e) => onLoad({ source: e.target.value, page: 1 })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
          {['all', 'user', 'admin', 'system', 'fraud', 'transaction', 'mining', 'auth'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select value={state.severity || 'all'} onChange={(e) => onLoad({ severity: e.target.value, page: 1 })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
          {['all', 'info', 'warning', 'danger', 'success'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </TabToolbar>
      <LoadingOrEmpty state={state} rows={rows}>
        <div className="space-y-3">
          {rows.map((log) => (
            <div key={log.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">{log.label || log.action}</p>
                  <p className="text-xs text-slate-500">{log.description || log.action}</p>
                </div>
                <div className="flex gap-2">
                  <Badge text={String(log.source || '')} />
                  <Badge
                    text={String(log.severity || '')}
                    color={log.severity === 'danger' ? 'red' : log.severity === 'warning' ? 'amber' : log.severity === 'success' ? 'emerald' : 'slate'}
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-slate-500">
                <span>{log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : ''}</span>
                {log.ip ? (
                  <span className="font-mono">
                    IP {log.ip}
                    <CopyButton value={log.ip} />
                  </span>
                ) : null}
                {log.relatedEntityId ? (
                  <span className="font-mono">
                    {log.relatedEntityType}: {log.relatedEntityId}
                    <CopyButton value={log.relatedEntityId} />
                  </span>
                ) : null}
              </div>
              <div className="mt-2">
                <MetaBlock value={log.metadata} />
              </div>
            </div>
          ))}
        </div>
      </LoadingOrEmpty>
      <Pager state={state} total={state?.data?.total} onLoad={onLoad} />
    </div>
  );
}

export function TicketsTab({ state = {}, onLoad }: { state?: AdminUsersTabSlice; onLoad: (o: Partial<AdminUsersTabSlice>) => void }) {
  const rows: TicketRow[] = state.data?.tickets || [];
  return (
    <SimpleList
      state={state}
      rows={rows}
      onLoad={onLoad}
      render={(t) => (
        <div>
          <p className="font-bold text-white">
            #{t.id} {t.subject}
          </p>
          <p className="mt-1 text-xs text-slate-500">{t.message}</p>
          <p className="mt-2 text-[10px] text-slate-600">
            {t.isReplied ? 'Respondido' : 'Pendente'} · {t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : ''}
          </p>
        </div>
      )}
    />
  );
}

export function MachinesTab({ state = {}, onLoad }: { state?: AdminUsersTabSlice; onLoad: (o: Partial<AdminUsersTabSlice>) => void }) {
  const rows: MachineRow[] = state.data?.machines || [];
  return (
    <SimpleList
      state={state}
      rows={rows}
      onLoad={onLoad}
      render={(m) => (
        <div className="flex items-center gap-3">
          <img src={m.imageUrl || '/media/miners/reward1.webp'} alt="" className="h-10 w-10 object-contain" />
          <div>
            <p className="font-bold text-white">
              #{m.id} {m.miner?.name || 'Máquina'}
            </p>
            <p className="text-xs text-slate-500">
              {formatHashrate(Number(m.hashRate || 0))} · slot {m.slotIndex} · {m.isActive ? 'ativa' : 'inativa'}
            </p>
          </div>
        </div>
      )}
    />
  );
}

export function RelatedTab({ state = {}, onLoad }: { state?: AdminUsersTabSlice; onLoad: (o: Partial<AdminUsersTabSlice>) => void }) {
  const data = (state.data || {}) as RelatedDataPayload;
  const rows: RelatedUserWithRel[] = [
    ...(data.sameIp || []).map((x) => ({ ...x, rel: 'Mesmo IP' })),
    ...(data.sameWallet || []).map((x) => ({ ...x, rel: 'Mesma wallet' })),
  ];
  return (
    <div>
      <button type="button" onClick={() => onLoad({ page: 1 })} className="mb-4 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300">
        Recarregar relacionados
      </button>
      <LoadingOrEmpty state={state} rows={rows}>
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((u) => (
            <div key={`${u.rel}-${u.id}`} className="rounded-2xl border border-slate-800 p-4">
              <Badge text={u.rel} color="amber" />
              <p className="mt-2 font-mono text-amber-200">#{u.id}</p>
              <p className="text-sm text-white">{u.username || u.email}</p>
              <p className="break-all text-xs text-slate-500">{u.email}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-500">{u.ip || u.registrationIp || '--'}</p>
            </div>
          ))}
        </div>
      </LoadingOrEmpty>
      {(data.referrals || []).length ? (
        <div className="mt-6">
          <p className="mb-2 text-xs font-black uppercase text-slate-500">Referrals</p>
          {(data.referrals || []).map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-800 p-3 text-xs text-slate-300">
              #{r.referrerId} indicou #{r.referredId} · {new Date(r.createdAt).toLocaleString('pt-BR')}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SimpleList<T extends { id: string | number }>({
  state,
  rows,
  onLoad,
  render,
}: {
  state: AdminUsersTabSlice | undefined;
  rows: T[];
  onLoad: (o: Partial<AdminUsersTabSlice>) => void;
  render: (row: T) => ReactNode;
}) {
  return (
    <div>
      <TabToolbar state={state} onLoad={onLoad} />
      <LoadingOrEmpty state={state} rows={rows}>
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              {render(row)}
            </div>
          ))}
        </div>
      </LoadingOrEmpty>
      <Pager state={state} total={state?.data?.total} onLoad={onLoad} />
    </div>
  );
}

export type SendMinerTabProps = {
  selectedUser: AdminUserDetailsPayload;
  standardMiners: MinerCatalogRow[];
  eventMiners: MinerCatalogRow[];
  sendMinerId: string;
  setSendMinerId: (v: string) => void;
  sendQty: number;
  setSendQty: Dispatch<SetStateAction<number>>;
  isSending: boolean;
  handleSendMiner: () => void | Promise<void>;
};

export function SendMinerTab({
  selectedUser,
  standardMiners,
  eventMiners,
  sendMinerId,
  setSendMinerId,
  sendQty,
  setSendQty,
  isSending,
  handleSendMiner,
}: SendMinerTabProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <select value={sendMinerId} onChange={(e) => setSendMinerId(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white">
          <option value="">Selecione uma máquina...</option>
          {standardMiners.length ? (
            <optgroup label="Mineradoras normais">
              {standardMiners.map((m) => (
                <option key={String(m.id)} value={String(m.id)}>
                  {m.name} - {Number(m.baseHashRate).toFixed(1)} H/s
                </option>
              ))}
            </optgroup>
          ) : null}
          {eventMiners.length ? (
            <optgroup label="Máquinas de evento">
              {eventMiners.map((m) => (
                <option key={String(m.id)} value={String(m.id)}>
                  {m.name} - {Number(m.baseHashRate).toFixed(1)} H/s
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSendQty((q: number) => Math.max(1, q - 1))} className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-white">
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            min={1}
            max={100}
            value={sendQty}
            onChange={(e) => setSendQty(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
            className="w-24 rounded-xl border border-slate-700 bg-slate-800 p-3 text-center text-lg font-black text-white"
          />
          <button type="button" onClick={() => setSendQty((q: number) => Math.min(100, q + 1))} className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-white">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={() => void handleSendMiner()} disabled={isSending || !sendMinerId} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 py-4 text-sm font-black uppercase tracking-widest text-slate-950 disabled:opacity-40">
          {isSending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Send className="h-4 w-4" /> Enviar para {selectedUser.user.username || selectedUser.user.email}
            </>
          )}
        </button>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-500">
        <Package className="mb-3 h-5 w-5 text-emerald-400" />
        O envio cria itens no inventário do usuário e registra ação administrativa nos logs.
      </div>
    </div>
  );
}


