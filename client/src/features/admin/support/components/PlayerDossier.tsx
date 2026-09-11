import { useCallback, useMemo, type ReactNode, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, ChevronLeft, ChevronRight, Cpu, Fingerprint, Loader2, Mail, Plus, RefreshCw, User, Wallet } from 'lucide-react';
import type { AdminSupportDossierPaged, AdminSupportPlayerDossierBundle, AdminSupportPlayerDossierParams } from '../../lib/admin.api';

type NumericPageKey = 'depositsPage' | 'ccpaymentPage' | 'withdrawalsPage' | 'payoutsPage' | 'minersPage';

function resolveAssetUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (typeof window !== 'undefined' && u.startsWith('/')) return `${window.location.origin}${u}`;
  return u;
}

type PagerProps = { t: TFunction; page: number; limit: number; total: number; onPrev: () => void; onNext: () => void };

function Pager({ t, page, limit, total, onPrev, onNext }: PagerProps) {
  const maxPage = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center gap-1">
      <button type="button" disabled={page <= 1} onClick={onPrev} className="rounded-lg border border-slate-700 p-1 text-slate-400 hover:text-white disabled:opacity-30" aria-label={t('adminSupport.dossier.page_prev')}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-2 font-mono text-[10px] text-slate-500">{page}/{maxPage}</span>
      <button type="button" disabled={page >= maxPage} onClick={onNext} className="rounded-lg border border-slate-700 p-1 text-slate-400 hover:text-white disabled:opacity-30" aria-label={t('adminSupport.dossier.page_next')}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

type PagedTableProps<Row> = {
  t: TFunction;
  title: string;
  sectionKey: NumericPageKey;
  data: AdminSupportDossierPaged<Row> | undefined;
  params: AdminSupportPlayerDossierParams;
  onPageDelta: (delta: number) => void;
  columns: Array<{ key: string; label: string }>;
  rowRender: (row: Row) => ReactNode;
};

function PagedTable<Row>({ t, title, sectionKey, data, params, onPageDelta, columns, rowRender }: PagedTableProps<Row>) {
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const limit = params.limit ?? 30;
  const page = params[sectionKey] ?? 1;
  return (
    <details className="group rounded-xl border border-slate-800/60 bg-slate-950/30 open:bg-slate-950/40">
      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 group-open:text-amber-500/90">{title}</span>
          <Pager t={t} page={page} limit={limit} total={total} onPrev={() => onPageDelta(-1)} onNext={() => onPageDelta(1)} />
        </div>
      </summary>
      <div className="overflow-x-auto px-2 pb-3">
        {rows.length ? (
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {columns.map((c) => (
                  <th key={c.key} className="px-2 py-2">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>{rows.map((row) => rowRender(row))}</tbody>
          </table>
        ) : (
          <p className="px-3 pb-2 text-sm text-slate-500">{t('adminSupport.dossier.none')}</p>
        )}
      </div>
    </details>
  );
}

type Props = {
  bundle: AdminSupportPlayerDossierBundle | null;
  loading: boolean;
  error: boolean;
  params: AdminSupportPlayerDossierParams;
  onParamsChange: (patch: Partial<AdminSupportPlayerDossierParams>) => void;
  onRetry: () => void;
  onCreditPol?: () => void;
};

export default function PlayerDossier({ bundle, loading, error, params, onParamsChange, onRetry, onCreditPol }: Props) {
  const { t } = useTranslation();

  const changePage = useCallback(
    (key: NumericPageKey, delta: number) => {
      const cur = params[key] ?? 1;
      onParamsChange({ [key]: Math.max(1, cur + delta) });
    },
    [onParamsChange, params],
  );

  const notLinked = bundle != null && bundle.ok && bundle.linked === false;
  const orphan = bundle != null && bundle.ok && bundle.linked === true && 'orphanTicket' in bundle && bundle.orphanTicket === true;
  const dossier = bundle != null && bundle.ok && bundle.linked === true && bundle.dossier ? bundle.dossier : null;
  const summary = dossier?.summary;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groupedMiners = useMemo(() => {
    const rows = dossier?.miners?.rows as Array<Record<string, unknown>> | undefined;
    if (!rows?.length) return [] as Array<{ row: Record<string, unknown>; count: number; activeCount: number }>;
    const groups = new Map<string, { row: Record<string, unknown>; count: number; activeCount: number }>();
    for (const m of rows) {
      const key = `${String(m.minerId ?? m.displayName ?? '')}|${String(m.level ?? '')}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        if (m.isActive) existing.activeCount++;
      } else {
        groups.set(key, { row: m, count: 1, activeCount: m.isActive ? 1 : 0 });
      }
    }
    return Array.from(groups.values());
  }, [dossier?.miners?.rows]);

  if (!bundle) {
    if (loading) {
      return (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 py-10 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
          <span className="text-sm font-medium">{t('adminSupport.dossier.loading')}</span>
        </div>
      );
    }
    if (error) {
      return (
        <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-4 text-center">
          <p className="text-sm text-red-200/90">{t('adminSupport.dossier.error')}</p>
          <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-200 hover:border-amber-500/40">
            <RefreshCw className="h-3.5 w-3.5" />
            {t('adminSupport.dossier.retry')}
          </button>
        </div>
      );
    }
    return null;
  }

  if (notLinked) {
    return (
      <section className="rounded-2xl border border-amber-900/30 bg-amber-950/10 p-4 sm:p-5" aria-label={t('adminSupport.dossier.title')}>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-500">
          <Fingerprint className="h-4 w-4" />
          {t('adminSupport.dossier.title')}
        </h3>
        <p className="text-sm leading-relaxed text-slate-300">{t('adminSupport.dossier.not_linked')}</p>
      </section>
    );
  }

  if (orphan) {
    return (
      <section className="rounded-2xl border border-orange-900/40 bg-orange-950/15 p-4 sm:p-5" aria-label={t('adminSupport.dossier.title')}>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-400">
          <AlertTriangle className="h-4 w-4" />
          {t('adminSupport.dossier.title')}
        </h3>
        <p className="text-sm leading-relaxed text-slate-300">{t('adminSupport.dossier.orphan')}</p>
      </section>
    );
  }

  if (!dossier) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/30 p-4 sm:p-5" aria-label={t('adminSupport.dossier.title')}>
      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-800/40 bg-red-950/25 px-3 py-2 text-xs text-red-100/90">
          <span>{t('adminSupport.dossier.error')}</span>
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-lg border border-red-800/50 px-2 py-1 font-bold uppercase tracking-wide hover:bg-red-900/30">
            <RefreshCw className="h-3 w-3" />
            {t('adminSupport.dossier.retry')}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-500">
          <Fingerprint className="h-4 w-4" />
          {t('adminSupport.dossier.title')}
        </h3>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-amber-500" /> : null}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('adminSupport.dossier.display_name')}</p>
          <p className="truncate text-base font-bold text-white">{summary?.name ?? '—'}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('adminSupport.dossier.username')}</p>
          <p className="truncate text-sm text-slate-200">{summary?.username ? `@${summary.username}` : '—'}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('adminSupport.dossier.player_id')}</p>
          <p className="font-mono text-sm text-white">{summary?.id ?? '—'}</p>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Mail className="h-3 w-3" /> {t('adminSupport.dossier.email')}
          </p>
          <p className="break-all text-sm text-slate-200">{summary?.email ?? '—'}</p>
        </div>
        {summary?.isBanned ? (
          <div className="sm:col-span-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-200">
            {t('adminSupport.dossier.banned')}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('adminSupport.dossier.pol_balance')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm text-emerald-300/90">{summary?.polBalance ?? '—'}</p>
            {onCreditPol ? (
              <button type="button" onClick={onCreditPol} className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/40 bg-emerald-950/30 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-300 hover:border-emerald-500/60 hover:bg-emerald-900/40">
                <Plus className="h-3 w-3" />
                {t('adminSupport.creditPol.button')}
              </button>
            ) : null}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('adminSupport.dossier.blk_balance')}</p>
          <p className="font-mono text-sm text-sky-300/90">{summary?.blkBalance ?? '—'}</p>
        </div>
        <div className="min-w-0 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/60">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('adminSupport.dossier.registration_ip')}</p>
            <p className="break-all font-mono text-xs text-slate-300">{summary?.registrationIp ?? '—'}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('adminSupport.dossier.last_ip')}</p>
            <p className="break-all font-mono text-xs text-slate-300">{summary?.lastIp ?? '—'}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
        <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <Wallet className="h-3.5 w-3.5" />
          {t('adminSupport.dossier.wallet_addresses')}
        </p>
        {dossier.walletAddresses?.length ? (
          <ul className="space-y-2">
            {dossier.walletAddresses.map((addr) => (
              <li key={addr} className="break-all font-mono text-xs text-slate-300">{addr}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t('adminSupport.dossier.none')}</p>
        )}
      </div>

      <PagedTable
        t={t}
        title={t('adminSupport.dossier.deposits')}
        sectionKey="depositsPage"
        data={dossier.depositTransactions}
        params={params}
        onPageDelta={(delta) => changePage('depositsPage', delta)}
        columns={[
          { key: 'id', label: t('adminSupport.dossier.col_id') },
          { key: 'amount', label: t('adminSupport.dossier.col_amount') },
          { key: 'status', label: t('adminSupport.dossier.col_status') },
          { key: 'createdAt', label: t('adminSupport.dossier.col_date') },
        ]}
        rowRender={(row) => (
          <tr key={String(row.id)} className="border-b border-slate-800/50 text-xs text-slate-300">
            <td className="px-2 py-2 font-mono">{String(row.id)}</td>
            <td className="px-2 py-2 font-mono">{String(row.amount ?? '—')}</td>
            <td className="px-2 py-2">{String(row.status ?? '—')}</td>
            <td className="px-2 py-2 whitespace-nowrap">{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '—'}</td>
          </tr>
        )}
      />

      <PagedTable
        t={t}
        title={t('adminSupport.dossier.deposits_ccpayment')}
        sectionKey="ccpaymentPage"
        data={dossier.ccpaymentDeposits}
        params={params}
        onPageDelta={(delta) => changePage('ccpaymentPage', delta)}
        columns={[
          { key: 'id', label: t('adminSupport.dossier.col_id') },
          { key: 'amountPol', label: t('adminSupport.dossier.col_amount_pol') },
          { key: 'credited', label: t('adminSupport.dossier.col_credited') },
          { key: 'createdAt', label: t('adminSupport.dossier.col_date') },
        ]}
        rowRender={(row) => (
          <tr key={String(row.id)} className="border-b border-slate-800/50 text-xs text-slate-300">
            <td className="px-2 py-2 font-mono">{String(row.id)}</td>
            <td className="px-2 py-2 font-mono">{String(row.amountPol ?? '—')}</td>
            <td className="px-2 py-2">{String(row.credited)}</td>
            <td className="px-2 py-2 whitespace-nowrap">{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '—'}</td>
          </tr>
        )}
      />

      <PagedTable
        t={t}
        title={t('adminSupport.dossier.withdrawals')}
        sectionKey="withdrawalsPage"
        data={dossier.withdrawalTransactions}
        params={params}
        onPageDelta={(delta) => changePage('withdrawalsPage', delta)}
        columns={[
          { key: 'id', label: t('adminSupport.dossier.col_id') },
          { key: 'amount', label: t('adminSupport.dossier.col_amount') },
          { key: 'status', label: t('adminSupport.dossier.col_status') },
          { key: 'address', label: t('adminSupport.dossier.col_to') },
          { key: 'createdAt', label: t('adminSupport.dossier.col_date') },
        ]}
        rowRender={(row) => (
          <tr key={String(row.id)} className="border-b border-slate-800/50 text-xs text-slate-300">
            <td className="px-2 py-2 font-mono">{String(row.id)}</td>
            <td className="px-2 py-2 font-mono">{String(row.amount ?? '—')}</td>
            <td className="px-2 py-2">{String(row.status ?? '—')}</td>
            <td className="max-w-[120px] truncate px-2 py-2 font-mono" title={row.address ? String(row.address) : undefined}>
              {row.address ? String(row.address) : '—'}
            </td>
            <td className="px-2 py-2 whitespace-nowrap">{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '—'}</td>
          </tr>
        )}
      />

      <PagedTable
        t={t}
        title={t('adminSupport.dossier.payouts')}
        sectionKey="payoutsPage"
        data={dossier.payouts}
        params={params}
        onPageDelta={(delta) => changePage('payoutsPage', delta)}
        columns={[
          { key: 'id', label: t('adminSupport.dossier.col_id') },
          { key: 'amountPol', label: t('adminSupport.dossier.col_amount_pol') },
          { key: 'source', label: t('adminSupport.dossier.col_source') },
          { key: 'createdAt', label: t('adminSupport.dossier.col_date') },
        ]}
        rowRender={(row) => (
          <tr key={String(row.id)} className="border-b border-slate-800/50 text-xs text-slate-300">
            <td className="px-2 py-2 font-mono">{String(row.id)}</td>
            <td className="px-2 py-2 font-mono">{String(row.amountPol ?? '—')}</td>
            <td className="px-2 py-2">{String(row.source ?? '—')}</td>
            <td className="px-2 py-2 whitespace-nowrap">{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : '—'}</td>
          </tr>
        )}
      />

      <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Cpu className="h-3.5 w-3.5" />
            {t('adminSupport.dossier.miners')}
          </p>
          <Pager
            t={t}
            page={params.minersPage ?? 1}
            limit={params.limit ?? 30}
            total={dossier.miners?.total ?? 0}
            onPrev={() => changePage('minersPage', -1)}
            onNext={() => changePage('minersPage', 1)}
          />
        </div>
        {groupedMiners.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groupedMiners.map(({ row: m, count, activeCount }) => {
              const src = resolveAssetUrl(m.imageUrl);
              const grouped = count > 1;
              return (
                <div key={`${String(m.minerId ?? m.displayName)}-${String(m.level)}`} className="flex gap-3 rounded-lg border border-slate-800/80 bg-slate-900/50 p-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain"
                        onError={(e: SyntheticEvent<HTMLImageElement>) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-600">
                        <User className="h-6 w-6" />
                      </div>
                    )}
                    {grouped && (
                      <span className="absolute bottom-0 right-0 rounded-tl-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-slate-950 leading-none">
                        {t('adminSupport.dossier.miner_count', { count })}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-xs text-slate-300">
                    <p className="font-bold text-white">{String(m.displayName ?? 'Miner')}</p>
                    {!grouped && <p className="mt-1 font-mono text-[10px] text-slate-500">ID {String(m.id)}</p>}
                    <p className="mt-1">
                      {t('adminSupport.dossier.miner_level')}: {String(m.level)} · {t('adminSupport.dossier.miner_hash')}: {String(m.hashRate)} · {t('adminSupport.dossier.miner_slots')}: {String(m.slotSize)}
                    </p>
                    {grouped ? (
                      <p className="text-slate-500">
                        {t('adminSupport.dossier.miner_active')}: {activeCount}/{count}
                      </p>
                    ) : (
                      <p className="text-slate-500">
                        {t('adminSupport.dossier.miner_slot_index')}: {String(m.slotIndex)} · {t('adminSupport.dossier.miner_active')}: {m.isActive ? t('adminSupport.dossier.yes') : t('adminSupport.dossier.no')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('adminSupport.dossier.none')}</p>
        )}
      </div>
    </section>
  );
}
