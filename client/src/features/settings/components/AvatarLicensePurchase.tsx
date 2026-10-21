import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LicensePurchaseModal from './LicensePurchaseModal';
import { quoteAmount, type AvatarChannel, type AvatarCurrency, type AvatarStatus } from '../lib/avatar.api';

type Props = {
  status: AvatarStatus;
  channel: AvatarChannel;
  ctaLabel: string;
  onDone: () => void | Promise<void>;
};

/** Currency picker + amount; "Buy" opens the confirmation popup with the certificate. */
export default function AvatarLicensePurchase({ status, channel, ctaLabel, onDone }: Props) {
  const { t } = useTranslation();
  const [currency, setCurrency] = useState<AvatarCurrency>('POL');
  const [modal, setModal] = useState<{ currency: AvatarCurrency; amount: string } | null>(null);

  const quote = status.quotes.find((q) => q.currency === currency) ?? null;
  const amount = quoteAmount(quote, channel);
  const hasBalance = amount != null && quote != null && Number(quote.balance) >= Number(amount);

  const selectId = `avatar-currency-${channel}`;
  return (
    <div className="space-y-3" data-testid={`avatar-purchase-${channel}`}>
      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400" htmlFor={selectId}>
        {t('profilePhoto.pay_with')}
      </label>
      <select
        id={selectId}
        value={currency}
        onChange={(e) => setCurrency(e.target.value as AvatarCurrency)}
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
      <button
        type="button"
        onClick={() => amount && setModal({ currency, amount })}
        disabled={!amount || !hasBalance}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] transition-all hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {ctaLabel}
      </button>
      {modal ? (
        <LicensePurchaseModal
          currency={modal.currency}
          amount={modal.amount}
          channel={channel}
          onPaid={onDone}
          onClose={() => {
            setModal(null);
            void onDone();
          }}
        />
      ) : null}
    </div>
  );
}
