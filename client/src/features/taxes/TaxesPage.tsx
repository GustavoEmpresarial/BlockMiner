import { useEffect, useState } from 'react';
import { Receipt, Flame, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-4 py-3">
          <p className="text-sm font-medium text-orange-300">{t('taxes.recovery.eligible_title')}</p>
          <p className="text-sm text-gray-400 mt-0.5">
            {t('taxes.recovery.eligible_desc', { streak: lastStreak, days: missedDays })}
          </p>
        </div>

        <TaxPayCurrencyPicker
          selected={payCurrency}
          quotes={feeQuotes}
          onChange={setPayCurrency}
          disabled={paying}
          label={t('taxes.pay_currency_label')}
        />

        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>{t('taxes.recovery.fee_label')}</span>
            <span className="text-white font-medium">{feeLabel}</span>
          </div>
          {quote && (
            <div className="flex justify-between text-gray-400">
              <span>{t('taxes.recovery.balance_label')}</span>
              <span className={hasBalance ? 'text-green-400' : 'text-red-400'}>
                {formatTaxPayAmount(quote.balance, payCurrency)}
              </span>
            </div>
          )}
        </div>

        {!hasBalance && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {t('taxes.recovery.error_insufficient')}
          </div>
        )}

        <button
          onClick={() => void handlePay()}
          disabled={paying || !hasBalance}
          className="w-full rounded-lg bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/30 disabled:cursor-not-allowed text-white font-semibold py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
        >
          {paying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
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
    <div className=" px-4 sm:px-6 py-8 sm:py-12 flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
          <Receipt className="w-10 h-10 text-yellow-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">{t('taxes.title')}</h1>
        <p className="text-gray-400 max-w-md">{t('taxes.page_subtitle')}</p>
      </div>

      <div className="w-full rounded-xl border border-orange-500/20 bg-white/5 p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-white font-medium">{t('taxes.recovery.title')}</p>
            <p className="text-sm text-gray-400">{t('taxes.recovery.subtitle')}</p>
          </div>
        </div>
        {renderRecoveryBody()}
      </div>

      <PowerBoostBanner />

      <EnergyTaxSection />
    </div>
  );
}
