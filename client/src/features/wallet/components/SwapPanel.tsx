import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { walletApi } from '../lib/wallet.api';
import type { SwapAsset } from '../lib/wallet.types';

const SWAP_ASSETS: SwapAsset[] = ['POL', 'SHIB'];

const SWAP_PRICES_REFRESH_MS = 120_000;

const ASSET_META: Record<
  SwapAsset,
  { symbol: SwapAsset; logoUrl: string; nameKey: string }
> = {
  POL: {
    symbol: 'POL',
    logoUrl: '/media/icons/polygon.webp',
    nameKey: 'dashboard.currency_pol',
  },
  SHIB: {
    symbol: 'SHIB',
    logoUrl: '/media/brand/shib.webp',
    nameKey: 'dashboard.currency_shib',
  },
};

function formatPolAmount(value: number): string {
  if (value <= 0) return '0';
  if (value >= 0.001) return parseFloat(value.toFixed(3)).toString();
  if (value >= 1e-4) return parseFloat(value.toFixed(4)).toString();
  return parseFloat(value.toFixed(6)).toString();
}

function formatShibAmount(value: number): string {
  return Math.floor(value).toString();
}

function formatBlkAmount(value: number): string {
  if (value <= 0) return '0';
  if (value >= 0.01) return parseFloat(value.toFixed(4)).toString();
  return parseFloat(value.toFixed(8)).toString();
}

function formatAssetBalance(asset: SwapAsset, value: number): string {
  return asset === 'SHIB' ? `${formatShibAmount(value)} SHIB` : `${formatPolAmount(value)} POL`;
}

function TokenAvatar({
  url,
  symbol,
  className = 'w-7 h-7',
}: {
  url: string;
  symbol: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-slate-800 text-[10px] font-black text-slate-300 shrink-0 ${className}`}
      >
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={`rounded-full object-cover shrink-0 ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

type SwapPrices = { POL: number; SHIB: number };

function SwapFromPicker({
  selected,
  balances,
  onChange,
}: {
  selected: SwapAsset;
  balances: { POL: number; SHIB: number };
  onChange: (asset: SwapAsset) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuStyle(null);
      return undefined;
    }
    const place = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const width = Math.max(rect.width, 260);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      let top = rect.bottom + 6;
      const menuHeight = menuRef.current?.offsetHeight ?? 180;
      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - 6);
      }
      setMenuStyle({ top, left, width });
    };
    place();
    requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const meta = ASSET_META[selected];
  const balanceLabel = formatAssetBalance(selected, balances[selected]);

  const menu =
    open && menuStyle
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ top: menuStyle.top, left: menuStyle.left, width: menuStyle.width }}
            className="fixed z-[10050] rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden"
          >
            <p className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
              {t('wallet.shib.swap_from_label')}
            </p>
            <ul className="py-1.5">
              {SWAP_ASSETS.map((asset) => {
                const item = ASSET_META[asset];
                const isSelected = asset === selected;
                return (
                  <li key={asset}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(asset);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                        isSelected ? 'bg-violet-500/15 text-white' : 'hover:bg-slate-900 text-slate-300'
                      }`}
                    >
                      <TokenAvatar url={item.logoUrl} symbol={item.symbol} className="w-9 h-9" />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-black truncate">{t(item.nameKey)}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          {formatAssetBalance(asset, balances[asset])}
                        </p>
                      </div>
                      {isSelected ? <Check className="w-5 h-5 text-violet-400 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-2" ref={rootRef}>
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">
        {t('wallet.shib.swap_from_label')}
      </p>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/90 px-4 py-3.5 text-left transition-colors hover:border-violet-500/50"
      >
        <TokenAvatar url={meta.logoUrl} symbol={meta.symbol} className="w-9 h-9" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-black text-white truncate">{t(meta.nameKey)}</p>
          <p className="text-xs text-slate-400 font-mono tabular-nums">{balanceLabel}</p>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {menu}
    </div>
  );
}

export type SwapPanelProps = {
  shibBalance: number;
  polBalance: number;
  blkBalance: number;
  onRefresh: () => void | Promise<boolean>;
};

export function SwapPanel({ shibBalance, polBalance, blkBalance, onRefresh }: SwapPanelProps) {
  const { t } = useTranslation();
  const [fromAsset, setFromAsset] = useState<SwapAsset>('POL');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [prices, setPrices] = useState<SwapPrices | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);

  const fetchPrices = useCallback(async () => {
    setPricesLoading(true);
    try {
      const res = await walletApi.getSwapBalances();
      const shibRate = res.data.prices?.SHIB;
      const polRate = res.data.prices?.POL;
      if (typeof shibRate === 'number' && typeof polRate === 'number') {
        setPrices({ SHIB: shibRate, POL: polRate });
      }
    } catch {
      /* keep last rates */
    } finally {
      setPricesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrices();
    const id = window.setInterval(() => {
      void fetchPrices();
    }, SWAP_PRICES_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchPrices]);

  const numericAmount = Number(amount);
  const maxBalance = fromAsset === 'SHIB' ? shibBalance : polBalance;
  const estimatedBlk =
    !prices || !numericAmount || numericAmount <= 0
      ? null
      : Number(
          (fromAsset === 'SHIB'
            ? numericAmount * prices.SHIB
            : numericAmount * prices.POL
          ).toFixed(8),
        );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error(t('wallet.shib.enter_amount'));
      return;
    }
    if (value > maxBalance) {
      toast.error(
        t(fromAsset === 'SHIB' ? 'wallet.shib.insufficient_shib' : 'wallet.shib.insufficient_pol'),
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await walletApi.postSwapExecute({
        fromAsset,
        toAsset: 'BLK',
        amount: value,
      });
      if (res.data.ok) {
        toast.success(
          t('wallet.shib.swap_success', {
            amount: `${formatBlkAmount(Number(res.data.output))} BLK`,
          }),
        );
        setAmount('');
        await onRefresh();
      } else {
        toast.error(res.data.message ?? t('wallet.shib.swap_failed'));
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? t('wallet.shib.swap_error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl text-[10px] text-slate-400 font-medium">
        {t('wallet.shib.swap_one_way_hint')}
      </div>

      <SwapFromPicker
        selected={fromAsset}
        balances={{ POL: polBalance, SHIB: shibBalance }}
        onChange={(asset) => {
          setFromAsset(asset);
          setAmount('');
        }}
      />

      <div className="flex justify-center">
        <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-violet-400">
          <ArrowDown className="w-5 h-5" />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">
          {t('wallet.shib.swap_to_label')}
        </p>
        <div className="flex w-full items-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3.5">
          <span className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-cyan-500/20 text-sm font-black text-cyan-300 shrink-0">
            B
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-white">BLK</p>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              {t('wallet.shib.blk_balance_now', { amount: formatBlkAmount(blkBalance) })}
            </p>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400/80">
            {t('wallet.shib.swap_to_fixed')}
          </span>
        </div>
      </div>

      <div className="p-4 bg-slate-900/60 border border-slate-700/50 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {t('wallet.shib.conversion_rate')}
          </span>
          <button
            type="button"
            onClick={() => void fetchPrices()}
            disabled={pricesLoading}
            className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pricesLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {prices ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400">{t('wallet.shib.rate_pol_to_blk')}</span>
              <span className="text-sm font-black text-cyan-300 tabular-nums">
                {formatBlkAmount(prices.POL)} BLK
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400">{t('wallet.shib.rate_shib_to_blk')}</span>
              <span className="text-sm font-black text-cyan-300 tabular-nums">
                {formatBlkAmount(prices.SHIB)} BLK
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-700/50">
              <span className="text-[10px] text-slate-500">POL ≈ ${prices.POL.toFixed(4)}</span>
              <span className="text-[10px] text-slate-500">1 BLK ≈ $1</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('wallet.shib.loading_prices')}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {t(fromAsset === 'SHIB' ? 'wallet.shib.amount_shib' : 'wallet.shib.amount_pol')}
          </label>
          <button
            type="button"
            onClick={() =>
              setAmount(String(fromAsset === 'SHIB' ? Math.floor(shibBalance) : polBalance))
            }
            className="text-[10px] font-black text-violet-400 hover:text-violet-300 uppercase tracking-widest transition-colors"
          >
            {t('wallet.shib.max')}
          </button>
        </div>
        <input
          type="number"
          step={fromAsset === 'SHIB' ? '1' : '0.000001'}
          min="0"
          value={amount}
          onChange={(ev) => setAmount(ev.target.value)}
          placeholder="0"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-violet-500 transition-colors"
          required
        />
        <p className="text-xs text-slate-500 mt-1.5 font-medium">
          {t('wallet.shib.available_balance')}{' '}
          {fromAsset === 'SHIB' ? (
            <span className="text-orange-300 font-black">{formatShibAmount(shibBalance)} SHIB</span>
          ) : (
            <span className="text-primary font-black">{formatPolAmount(polBalance)} POL</span>
          )}
        </p>
      </div>

      {estimatedBlk !== null && (
        <div className="p-4 bg-violet-500/10 border border-violet-500/30 rounded-2xl">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
            {t('wallet.shib.you_receive_estimate')}
          </p>
          <p className="text-2xl font-black tabular-nums text-cyan-300">
            ≈ {formatBlkAmount(estimatedBlk)}{' '}
            <span className="text-base text-cyan-300/70 ml-1">BLK</span>
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !amount || Number(amount) <= 0}
        className="w-full py-4 bg-violet-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
      >
        {submitting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <ArrowLeftRight className="w-5 h-5" />
        )}
        {t('wallet.shib.confirm_swap')}
      </button>
    </form>
  );
}
