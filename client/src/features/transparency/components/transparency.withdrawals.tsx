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
      .catch(() => { /* silent */ })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="rounded-2xl border border-white/8 bg-white/2 h-32 animate-pulse" data-testid="withdrawals-loading" />;
  }

  if (!stats?.ok) return null;

  const totalPol = stats.totalPol ?? 0;
  const totalCount = stats.totalCount ?? 0;

  return (
    <section
      className="rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-950/20 to-slate-950/40 overflow-hidden"
      data-testid="withdrawals-section"
    >
      <div className="px-6 py-4 border-b border-sky-500/10 bg-sky-500/5 flex items-center gap-2 flex-wrap">
        <Wallet className="w-4 h-4 text-sky-400" aria-hidden="true" />
        <p className="text-xs font-black text-sky-300 uppercase tracking-widest">
          {t('transparency.withdrawals.title')}
        </p>
        <p className="text-[11px] text-gray-500 ml-auto">{t('transparency.withdrawals.subtitle')}</p>
      </div>
      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/8 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500">{t('transparency.withdrawals.total_paid')}</p>
          <p className="mt-1 text-2xl font-black text-white">
            {totalPol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            <span className="text-sm text-sky-400 ml-2">POL</span>
          </p>
          {stats.totalUsd != null && (
            <p className="text-[11px] text-gray-500 mt-1">
              ≈ ${stats.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </p>
          )}
        </div>
        <div className="rounded-xl border border-white/8 bg-black/20 p-4">
          <p className="text-[10px] uppercase tracking-widest text-gray-500">{t('transparency.withdrawals.total_count')}</p>
          <p className="mt-1 text-2xl font-black text-white">
            {totalCount.toLocaleString()}
            <span className="text-sm text-gray-500 ml-2">{t('transparency.withdrawals.txs')}</span>
          </p>
          <a
            href="https://polygonscan.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300"
          >
            Polygonscan <ArrowUpRight className="w-3 h-3" />
          </a>
        </div>
      </div>
    </section>
  );
}
