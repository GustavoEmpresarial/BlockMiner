import type { TaxPayCurrency, TaxPayQuotes } from '../lib/taxPayCurrency';

type Props = {
  selected: TaxPayCurrency;
  quotes?: TaxPayQuotes;
  onChange: (currency: TaxPayCurrency) => void;
  disabled?: boolean;
  label?: string;
};

const OPTIONS: TaxPayCurrency[] = ['POL', 'BLK', 'SHIB'];

export function TaxPayCurrencyPicker({ selected, onChange, disabled, label }: Props) {
  return (
    <div className="space-y-2">
      {label ? <p className="text-xs font-bold uppercase tracking-widest text-gray-500">{label}</p> : null}
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((currency) => (
          <button
            key={currency}
            type="button"
            disabled={disabled}
            onClick={() => onChange(currency)}
            className={`rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-widest ${
              selected === currency
                ? 'border-primary bg-primary/15 text-primary'
                : 'border-gray-800 text-gray-400 hover:border-gray-600'
            }`}
          >
            {currency}
          </button>
        ))}
      </div>
    </div>
  );
}
