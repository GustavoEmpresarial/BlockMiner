import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../shared/auth/auth.store';
import { apiErrorMessage, formatHashrate } from '../../machines/lib/machines.shared';
import { EnergyDistributorMark } from './EnergyDistributorMark';

const DISTRIBUTOR_IMAGE_URL = '/media/racks/energy-generator.webp';

type EnergyTaxSummaryLite = {
  todayDailyCharge?: number;
  totalActivitiesToday?: number;
  unpaidDays?: number;
  todayPaid?: boolean;
  todayExempt?: boolean;
};

function fmtPol(n: number): string {
  return Number.isFinite(n)
    ? n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
    : '0';
}

type Props = {
  farmHashRate: number;
};

/** Energy-tax status panel for the inventory2 “Distribuidor” tab. */
export function Inventory2Distributor({ farmHashRate }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<EnergyTaxSummaryLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgFailed, setImgFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<EnergyTaxSummaryLite & { ok?: boolean }>('/energy-tax/summary');
      if (res.data) setSummary(res.data);
    } catch (err) {
      toast.error(apiErrorMessage(err, t('inventory2.distributor_load_error')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const bill = Number(summary?.todayDailyCharge) || 0;
  const activities = Number(summary?.totalActivitiesToday) || 0;
  const unpaidDays = Number(summary?.unpaidDays) || 0;
  const lit = farmHashRate > 0;

  return (
    <div className="space-y-6 rounded-3xl border border-amber-500/20 bg-slate-950/60 p-5 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-400/80">
            {t('inventory2.distributor_kicker')}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
            {t('inventory2.distributor_title')}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-400">{t('inventory2.distributor_desc')}</p>
        </div>
        <div className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-2.5">
          <Zap className="h-4 w-4 text-primary" aria-hidden />
          <span className="text-xs font-black tabular-nums text-primary">{formatHashrate(farmHashRate)}</span>
        </div>
      </div>

      <div className="flex justify-center">
        <div
          className={`relative overflow-hidden rounded-3xl border p-3 sm:p-4 ${
            lit
              ? 'border-amber-400/40 bg-amber-500/10 shadow-[0_0_40px_rgba(251,191,36,0.18)]'
              : 'border-slate-800 bg-slate-900/70'
          }`}
        >
          {imgFailed ? (
            <EnergyDistributorMark className="h-52 w-52 sm:h-64 sm:w-64" lit={lit} />
          ) : (
            <img
              src={DISTRIBUTOR_IMAGE_URL}
              alt={t('inventory2.distributor_image_alt')}
              className="h-auto w-64 max-w-full select-none sm:w-80"
              draggable={false}
              onError={() => setImgFailed(true)}
            />
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-24 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-slate-900/70 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t('inventory2.distributor_bill')}
            </p>
            <p className="mt-2 text-lg font-black tabular-nums text-white">{fmtPol(bill)} POL</p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-slate-900/70 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t('inventory2.distributor_status')}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-white">
              {summary?.todayPaid || summary?.todayExempt ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden />
              ) : null}
              {summary?.todayExempt
                ? t('inventory2.distributor_exempt')
                : summary?.todayPaid
                  ? t('inventory2.distributor_paid')
                  : t('inventory2.distributor_open', { days: unpaidDays })}
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-slate-900/70 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              {t('inventory2.distributor_activity')}
            </p>
            <p className="mt-2 text-lg font-black tabular-nums text-white">{activities}/10</p>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/taxes')}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-amber-200 transition-colors hover:bg-amber-400/20 sm:w-auto"
      >
        {t('inventory2.distributor_open_taxes')}
      </button>
    </div>
  );
}
