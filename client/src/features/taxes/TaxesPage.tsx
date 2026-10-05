import { useEffect, useState } from 'react';
import { Receipt, Flame, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import SectionHeader from '../../shared/components/SectionHeader';
import PowerBoostBanner from '../../shared/components/PowerBoostBanner';
import EnergyTaxSection from './components/EnergyTaxSection';
import { TaxPayCurrencyPicker } from './components/TaxPayCurrencyPicker';
import {
  formatTaxPayAmount,
  pickDefaultTaxPayCurrency,
  type TaxPayCurrency,
  type TaxPayQuotes,
} from './lib/taxPayCurrency';

type RecoveryStatus =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      lastStreak: number;
      missedDays: number;
      feePol: number;
      feeQuotes?: TaxPayQuotes;
    };

export default function TaxesPage() {
  const { t } = useTranslation();
  const [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payCurrency, setPayCurrency] = useState<TaxPayCurrency>('POL');

  useEffect(() => {
    let cancelled = false;
    setLoadingStatus(true);
    api
      .get<RecoveryStatus>('/checkin/streak-recovery/status')
      .then((r) => {
        if (cancelled) return;
        setRecovery(r.data);
        if (r.data.eligible && r.data.feeQuotes) {
          setPayCurrency(pickDefaultTaxPayCurrency(r.data.feeQuotes));
        }
      })
      .catch(() => {
        if (!cancelled) setRecovery(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paid]);

  async function handlePay() {
    setPaying(true);
    try {
      const res = await api.post<{ success: boolean; restoredStreak: number }>('/checkin/streak-recovery/pay', {
        currency: payCurrency,
      });
      if (res.data.success) {
        toast.success(t('taxes.recovery.success', { streak: res.data.restoredStreak }));
        setPaid((v) => !v);
      }
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      if (code === 'insufficient_balance') {
        toast.error(t('taxes.recovery.error_insufficient'));
      } else {
        toast.error(t('taxes.recovery.error_generic'));
      }
    } finally {
      setPaying(false);
    }
  }

  function renderRecoveryBody() {
    if (loadingStatus) {
      return (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('taxes.recovery.loading')}
        </div>
      );
    }

    if (!recovery) return null;

    if (!recovery.eligible) {
      const msgKey =
        {
          streak_active: 'taxes.recovery.not_eligible_streak_active',
          already_checked_in_today: 'taxes.recovery.not_eligible_checked_in',
          too_many_missed_days: 'taxes.recovery.not_eligible_too_many',
          no_streak: 'taxes.recovery.not_eligible_no_streak',
          already_recovered: 'taxes.recovery.not_eligible_already_recovered',
        }[recovery.reason] ?? 'taxes.recovery.not_eligible_no_streak';

      return (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          {t(msgKey)}
        </div>
      );
    }

    const { lastStreak, missedDays, feePol, feeQuotes } = recovery;
    const quote = feeQuotes?.[payCurrency];
    const hasBalance = quote?.affordable ?? false;
    const feeLabel = quote
      ? formatTaxPayAmount(quote.amount, payCurrency)
      : formatTaxPayAmount(feePol, 'POL');

    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-950/20 p-4 shadow-[1px_1px_0px_#000000]">
          <p className="text-sm font-black text-amber-300 uppercase tracking-tight">{t('taxes.recovery.eligible_title')}</p>
          <p className="text-xs text-slate-300 mt-1 font-medium leading-relaxed">
            {t('taxes.recovery.eligible_desc', { streak: lastStreak ?? 0, days: missedDays ?? 0 })}
          </p>
        </div>

        <TaxPayCurrencyPicker
          selected={payCurrency}
          quotes={feeQuotes}
          onChange={setPayCurrency}
          disabled={paying}
          label={t('taxes.pay_currency_label')}
        />

        <div className="flex flex-col gap-1.5 text-xs font-mono">
          <div className="flex justify-between text-slate-400">
            <span>{t('taxes.recovery.fee_label')}</span>
            <span className="text-white font-black">{feeLabel}</span>
          </div>
          {quote && (
            <div className="flex justify-between text-slate-400">
              <span>{t('taxes.recovery.balance_label')}</span>
              <span className={`font-black ${hasBalance ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatTaxPayAmount(quote.balance, payCurrency)}
              </span>
            </div>
          )}
        </div>

        {!hasBalance && (
          <div className="flex items-center gap-2 text-red-400 text-xs font-bold bg-red-950/20 border border-red-500/30 p-3 rounded-xl">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {t('taxes.recovery.error_insufficient')}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handlePay()}
          disabled={paying || !hasBalance}
          className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black text-xs uppercase tracking-wider py-3.5 transition-all shadow-[2px_2px_0px_#000000] flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {paying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
              {t('taxes.recovery.paying')}
            </>
          ) : (
            t('taxes.recovery.pay_button', { fee: feeLabel })
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={Receipt} variant="amber" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('taxes.title')}</h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">{t('taxes.page_subtitle')}</p>
          </div>
        </div>
      </div>

      <Card className="p-6 sm:p-7 space-y-4">
        <SectionHeader
          icon={Flame}
          iconVariant="amber"
          title={t('taxes.recovery.title')}
          subtitle={t('taxes.recovery.subtitle')}
        />
        {renderRecoveryBody()}
      </Card>

      <PowerBoostBanner />

      <EnergyTaxSection />
    </div>
  );
}
