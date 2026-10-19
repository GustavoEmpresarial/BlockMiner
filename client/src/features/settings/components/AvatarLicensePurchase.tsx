import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  avatarErrorCode,
  newIdempotencyKey,
  purchaseAvatarLicense,
  quoteAmount,
  type AvatarChannel,
  type AvatarCurrency,
  type AvatarStatus,
} from '../lib/avatar.api';

type Props = {
  status: AvatarStatus;
  channel: AvatarChannel;
  /** Label for the main button before confirming (buy or renew). */
  ctaLabel: string;
  onDone: () => void | Promise<void>;
};

/** Currency picker + amount + two-step confirm. The price comes from the server for `channel`. */
export default function AvatarLicensePurchase({ status, channel, ctaLabel, onDone }: Props) {
  const { t } = useTranslation();
  const [currency, setCurrency] = useState<AvatarCurrency>('POL');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const attemptKey = useRef<string | null>(null);

  const quote = status.quotes.find((q) => q.currency === currency) ?? null;
  const amount = quoteAmount(quote, channel);
  const hasBalance = amount != null && quote != null && Number(quote.balance) >= Number(amount);

  async function handleBuy() {
    if (!amount || busy) return;
    if (!confirming) {
      attemptKey.current = newIdempotencyKey();
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await purchaseAvatarLicense(currency, amount, attemptKey.current ?? newIdempotencyKey(), channel);
      toast.success(t('profilePhoto.purchased'));
      setConfirming(false);
      attemptKey.current = null;
    } catch (err) {
      const code = avatarErrorCode(err);
      toast.error(code ? t(`profilePhoto.errors.${code}`, { defaultValue: t('profilePhoto.errors.generic') }) : t('profilePhoto.errors.generic'));
      if (code === 'AVATAR_QUOTE_CHANGED') attemptKey.current = newIdempotencyKey();
    } finally {
      setBusy(false);
      await onDone();
    }
  }

  const selectId = `avatar-currency-${channel}`;
  return (
    <div className="space-y-3" data-testid={`avatar-purchase-${channel}`}>
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400" htmlFor={selectId}>
        {t('profilePhoto.pay_with')}
      </label>
      <select
        id={selectId}
        value={currency}
        disabled={busy}
        onChange={(e) => {
          setCurrency(e.target.value as AvatarCurrency);
          setConfirming(false);
        }}
        className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white focus:border-primary focus:outline-none"
      >
        {status.quotes.map((q) => (
          <option key={q.currency} value={q.currency}>
            {q.currency}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">{t('profilePhoto.amount')}</span>
          <span className="font-mono font-bold text-white" data-testid="avatar-amount">
            {amount ? `${amount} ${currency}` : t('profilePhoto.price_unavailable')}
          </span>
        </div>
        <div>
          <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">{t('profilePhoto.your_balance')}</span>
          <span className={`font-mono font-bold ${hasBalance ? 'text-slate-200' : 'text-red-400'}`}>{quote ? `${quote.balance} ${currency}` : '-'}</span>
        </div>
      </div>
      {confirming && amount && (
        <p className="text-xs font-bold text-amber-300" data-testid="avatar-confirm">
          {t('profilePhoto.confirm_buy', { amount, currency })}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleBuy()}
          disabled={busy || !amount || !hasBalance}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] transition-all hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? t('profilePhoto.buying') : confirming ? t('common.confirm') : ctaLabel}
        </button>
        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-xl border-2 border-slate-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
