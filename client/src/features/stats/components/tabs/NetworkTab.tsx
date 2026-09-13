import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatHashrate } from '../../utils/format';
import { updateMiningPayoutMode } from '../../lib/stats.api';
import { logStatsError } from '../../lib/stats.errors';
import type { StatsDashboardContext } from '../../lib/stats.types';

function NetworkTab({ power, onRefetchPower }: StatsDashboardContext) {
  const { t } = useTranslation();
  const network = power.network;
  const activeMode = power.overview?.miningPayoutMode === 'blk' ? 'blk' : 'pol';
  const [switching, setSwitching] = useState(false);

  const switchMode = async (mode: 'pol' | 'blk') => {
    if (switching || mode === activeMode) return;
    setSwitching(true);
    try {
      const res = await updateMiningPayoutMode(mode);
      if (!res.ok) throw new Error(res.message || 'Failed');
      toast.success(t('powerStats.payout.switch_success', { mode: mode.toUpperCase() }));
      await onRefetchPower?.();
    } catch (err: unknown) {
      logStatsError('STATS_PAYOUT_MODE_SWITCH_FAILED', err);
      toast.error(t('powerStats.payout.switch_error'));
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" />
            {t('powerStats.network.title')}
          </h3>
          <p className="text-xs text-slate-500">{t('powerStats.network.rank_label')}</p>
          <p className="text-3xl font-black text-white">
            {network?.userRank != null ? `#${network.userRank}` : '—'}{' '}
            <span className="text-lg text-slate-500 font-bold">/ {network?.totalRankedUsers ?? '—'}</span>
          </p>
          <p className="text-xs text-slate-400">{t('powerStats.network.active_users', { n: network?.activeUsersLast24h ?? 0 })}</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">{t('powerStats.network.blk_pool')}</h3>
          {network?.lastBlkCycle ? (
            <>
              <p className="text-lg font-mono text-amber-400">{formatHashrate(network.lastBlkCycle.totalHashrate)}</p>
              <p className="text-xs text-slate-500">
                {t('powerStats.network.miners_in_cycle', { n: network.lastBlkCycle.minerCount })}
              </p>
              {network.blkPoolSharePercent != null ? (
                <p className="text-sm text-emerald-400">
                  {t('powerStats.network.your_share', { pct: network.blkPoolSharePercent })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-600">{t('powerStats.network.no_cycle')}</p>
          )}
          {network?.blkPaused ? <p className="text-xs text-amber-500">{t('powerStats.network.blk_paused')}</p> : null}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.peak_share')}</p>
          <p className="text-2xl font-mono text-emerald-400 mt-2">
            {power.analytics?.miningLogPeakShare?.toFixed(4) ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.avg_share')}</p>
          <p className="text-2xl font-mono text-sky-400 mt-2">{power.analytics?.miningLogAvgShare?.toFixed(4) ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.samples')}</p>
          <p className="text-2xl font-mono text-white mt-2">{power.analytics?.miningLogSamples ?? 0}</p>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-3">{t('powerStats.payout.title')}</h3>
        <p className="text-xs text-slate-500 mb-4">{t('powerStats.payout.switch_label')}</p>
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            type="button"
            disabled={switching || activeMode === 'pol'}
            onClick={() => void switchMode('pol')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-colors ${
              activeMode === 'pol'
                ? 'bg-emerald-500 text-slate-950'
                : 'border border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            {switching && activeMode !== 'pol' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('powerStats.payout.switch_to_pol')}
            {activeMode === 'pol' ? ` · ${t('powerStats.payout.active')}` : ''}
          </button>
          <button
            type="button"
            disabled={switching || activeMode === 'blk'}
            onClick={() => void switchMode('blk')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-colors ${
              activeMode === 'blk'
                ? 'bg-amber-500 text-slate-950'
                : 'border border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            {switching && activeMode !== 'blk' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {t('powerStats.payout.switch_to_blk')}
            {activeMode === 'blk' ? ` · ${t('powerStats.payout.active')}` : ''}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {(power.payout?.rows || []).map((row) => (
            <div key={row.key} className="rounded-xl border border-slate-800 p-4 space-y-2">
              <p className="text-xs font-black text-slate-500 uppercase">{t(row.labelKey)}</p>
              <p className="text-2xl font-black text-white">{row.percent}%</p>
              <p className="text-[10px] text-slate-600">{t(row.noteKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(NetworkTab);
