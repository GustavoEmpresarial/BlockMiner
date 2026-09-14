import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Coins, Loader2 } from 'lucide-react';
import {
  ALLOWED_BURN_FEE_CURRENCIES,
  BURN_FEE_RATES,
  type BurnFeeCurrency,
  getBurnFeeAmount,
  hasSufficientFeeBalance,
} from '../lib/burnFee.config';

interface BurnFeeSelectorProps {
  selectedCurrency: BurnFeeCurrency;
  onSelectCurrency: (currency: BurnFeeCurrency) => void;
  balances: {
    shib: number;
    pol: number;
    blk: number;
  };
  loadingBalances?: boolean;
  disabled?: boolean;
}

const CURRENCY_META: Record<
  BurnFeeCurrency,
  {
    name: string;
    symbol: string;
    badgeStyle: string;
    decimals: number;
  }
> = {
  SHIB: {
    name: 'Shiba Inu',
    symbol: 'SHIB',
    badgeStyle: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    decimals: 2,
  },
  POL: {
    name: 'Polygon Ecosystem Token',
    symbol: 'POL',
    badgeStyle: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    decimals: 4,
  },
  BLK: {
    name: 'BlockMiner Token',
    symbol: 'BLK',
    badgeStyle: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    decimals: 4,
  },
};

export function BurnFeeSelector({
  selectedCurrency,
  onSelectCurrency,
  balances,
  loadingBalances = false,
  disabled = false,
}: BurnFeeSelectorProps) {
  const { t } = useTranslation();

  const isSelectedSufficient = hasSufficientFeeBalance(selectedCurrency, balances);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-300">
          <Coins className="h-4 w-4 text-orange-400" />
          {t('burnEvents.fee_title', { defaultValue: 'Taxa da Queima (Escolha a moeda)' })}
        </label>
        {loadingBalances && (
          <span className="flex items-center gap-1 text-[11px] text-slate-400">
            <Loader2 className="h-3 w-3 animate-spin text-orange-400" />
            {t('common.loading', { defaultValue: 'Atualizando saldos...' })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {ALLOWED_BURN_FEE_CURRENCIES.map((curr) => {
          const isSelected = selectedCurrency === curr;
          const feeAmount = getBurnFeeAmount(curr);
          const meta = CURRENCY_META[curr];
          const userBalance =
            curr === 'SHIB' ? balances.shib : curr === 'POL' ? balances.pol : balances.blk;
          const isSufficient = Number.isFinite(userBalance) && userBalance >= feeAmount;

          return (
            <button
              key={curr}
              type="button"
              aria-label={`fee-${curr}`}
              disabled={disabled}
              onClick={() => onSelectCurrency(curr)}
              className={`relative flex flex-col justify-between rounded-2xl border p-3 text-left transition-all duration-200 active:scale-[0.98] ${
                isSelected
                  ? 'border-orange-500/60 bg-gradient-to-b from-orange-500/15 via-slate-900 to-slate-950 shadow-md shadow-orange-500/10 ring-1 ring-orange-500/40'
                  : 'border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-slate-900/60'
              } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${meta.badgeStyle}`}
                >
                  {meta.symbol}
                </span>

                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                    isSufficient
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/15 text-red-400 border border-red-500/20'
                  }`}
                >
                  {isSufficient ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" />
                      {t('burnEvents.fee_available', { defaultValue: 'Disponível' })}
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3" />
                      {t('burnEvents.fee_insufficient', { defaultValue: 'Falta saldo' })}
                    </>
                  )}
                </span>
              </div>

              <div className="my-2.5">
                <p className="text-[10px] uppercase font-bold text-slate-400">
                  {t('burnEvents.fee_required_label', { defaultValue: 'Taxa' })}
                </p>
                <p className="text-sm font-black text-white">
                  {feeAmount} <span className="text-xs text-orange-400 font-bold">{curr}</span>
                </p>
              </div>

              <div className="border-t border-white/5 pt-2">
                <p className="text-[10px] text-slate-400">
                  {t('burnEvents.your_balance', { defaultValue: 'Saldo atual:' })}{' '}
                  <span
                    className={`font-mono font-bold ${
                      isSufficient ? 'text-slate-200' : 'text-red-400'
                    }`}
                  >
                    {userBalance.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: meta.decimals,
                    })}
                  </span>
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {!isSelectedSufficient && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
          <div>
            <p className="font-bold">
              {t('burnEvents.insufficient_fee_warning_title', {
                defaultValue: 'Saldo insuficiente para a taxa!',
              })}
            </p>
            <p className="mt-0.5 text-slate-300 text-[11px]">
              {t('burnEvents.insufficient_fee_warning_body', {
                currency: selectedCurrency,
                amount: BURN_FEE_RATES[selectedCurrency],
                defaultValue: `Você precisa de pelo menos ${BURN_FEE_RATES[selectedCurrency]} ${selectedCurrency} para iniciar esta queima. Escolha outra moeda ou abasteça sua carteira.`,
              })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
