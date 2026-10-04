import { useEffect, useState } from 'react';
import { ArrowUpRight, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { WithdrawalStatsResponse } from './transparency.base';

export function WithdrawalsSection() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<WithdrawalStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/transparency/withdrawal-stats')
      .then((res) => res.json())
      .then((json: WithdrawalStatsResponse) => {
        if (!cancelled && json.ok) setStats(json);
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div
        className="rounded-3xl border-2 border-slate-800 bg-slate-900/40 h-36 animate-pulse shadow-[4px_4px_0px_#000000]"
        data-testid="withdrawals-loading"
      />
    );
  }

  if (!stats?.ok) return null;

  const totalPol = stats.totalPol ?? 0;
  const totalCount = stats.totalCount ?? 0;

  return (
    <section
      aria-labelledby="withdrawals-section-title"
      className="rounded-3xl border-2 border-sky-500/30 bg-gradient-to-br from-slate-900 via-sky-950/15 to-slate-900 overflow-hidden shadow-[4px_4px_0px_#000000]"
      data-testid="withdrawals-section"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-sky-500/20 bg-sky-950/30 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-[2px_2px_0px_#000000]">
            <Wallet className="w-4 h-4" aria-hidden="true" />
          </div>
          <h2 id="withdrawals-section-title" className="text-xs font-black text-sky-300 uppercase tracking-widest">
            {t('transparency.withdrawals.title')}
          </h2>
        </div>
        <p className="text-[11px] text-slate-400 font-medium">{t('transparency.withdrawals.subtitle')}</p>
      </div>

      <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-4 sm:p-5 shadow-[3px_3px_0px_#000000] flex flex-col justify-between">
          <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">
            {t('transparency.withdrawals.total_paid')}
          </span>
          <div className="mt-2">
            <p className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
              {totalPol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              <span className="text-sm font-bold text-sky-400 ml-2">POL</span>
            </p>
            {stats.totalUsd != null && (
              <p className="text-xs text-slate-400 mt-1 font-mono font-medium">
                ≈ ${stats.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                USD
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-4 sm:p-5 shadow-[3px_3px_0px_#000000] flex flex-col justify-between">
          <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400">
            {t('transparency.withdrawals.total_count')}
          </span>
          <div className="mt-2 flex items-baseline justify-between flex-wrap gap-2">
            <p className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
              {totalCount.toLocaleString()}
              <span className="text-sm font-bold text-slate-400 ml-2">{t('transparency.withdrawals.txs')}</span>
            </p>
            <a
              href="https://polygonscan.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:text-sky-300 py-1 px-2.5 rounded-lg border border-sky-500/30 bg-sky-950/40 shadow-[1px_1px_0px_#000000] transition-colors"
            >
              <span>Polygonscan</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
