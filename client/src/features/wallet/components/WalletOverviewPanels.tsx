import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  ChevronRight,
  Clock,
  ExternalLink,
  QrCode,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";
import type { WalletTFunction } from "../lib/wallet.i18n";
import type { WalletTransactionRow } from "../lib/wallet.types";

export function WalletStatusBadge({ status, t }: { status: string; t: WalletTFunction }) {
  const config: Record<string, { color: string; label: string }> = {
    completed: { color: "text-emerald-400 bg-emerald-400/10", label: t("wallet.ledger_badge_success") },
    pending: { color: "text-amber-400 bg-amber-400/10", label: t("wallet.ledger_badge_pending") },
    approved: { color: "text-sky-400 bg-sky-400/10", label: t("wallet.ledger_badge_approved") },
    failed: { color: "text-red-400 bg-red-400/10", label: t("wallet.ledger_badge_failed") },
  };
  const s = config[status] ?? config.pending;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${s.color}`}>
      {s.label}
    </span>
  );
}

type BalanceOverview = {
  amount: number;
  blkBalance: number;
  blkLocked: number;
  shibBalance: number;
  lifetimeMined: number;
  totalWithdrawn: number;
};

function CoinMark({
  src,
  ticker,
}: {
  src: string;
  ticker: string;
}) {
  return (
    <div className="relative w-9 h-9 rounded-full shrink-0 overflow-hidden bg-white/10 border border-white/15 flex items-center justify-center">
      <span className="text-[9px] font-black text-white/50">{ticker.slice(0, 3)}</span>
      <img
        src={src}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}

function readWalletBalCache(): Partial<BalanceOverview> | null {
  try {
    const raw = sessionStorage.getItem("__bmWalletBalCache");
    if (raw) return JSON.parse(raw) as Partial<BalanceOverview>;
  } catch {
    /* ignore */
  }
  const w = window as Window & { __bmWalletBalCache?: Partial<BalanceOverview> };
  return w.__bmWalletBalCache ?? null;
}

function tr(t: WalletTFunction, key: string, fallback: string) {
  const v = t(key);
  return !v || v === key ? fallback : v;
}

export function WalletBalanceOverview({
  balance,
  polPrice,
  t,
  isLoading = false,
}: {
  balance: BalanceOverview;
  polPrice: number;
  t: WalletTFunction;
  isLoading?: boolean;
}) {
  const cache = readWalletBalCache();
  const polAmount =
    balance.amount > 0 ? balance.amount : cache?.amount && cache.amount > 0 ? cache.amount : balance.amount;
  const blkAmount =
    balance.blkBalance > 0
      ? balance.blkBalance
      : cache?.blkBalance && cache.blkBalance > 0
        ? cache.blkBalance
        : balance.blkBalance;
  const shibAmount =
    balance.shibBalance > 0
      ? balance.shibBalance
      : typeof cache?.shibBalance === "number"
        ? cache.shibBalance
        : balance.shibBalance;
  const polLoading = !!(isLoading && !(balance.amount > 0) && !(cache?.amount && cache.amount > 0));
  const blkLoading = !!(isLoading && !(balance.blkBalance > 0) && !(cache?.blkBalance && cache.blkBalance > 0));
  const polUsd =
    polPrice > 0
      ? (polAmount * polPrice).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;
  const blkUsd = blkLoading
    ? "—"
    : blkAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="relative group overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-blue-600 to-indigo-900 opacity-90" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay" />

      <div className="relative p-5 sm:p-10 text-white space-y-5 sm:space-y-8">
        <div className="flex justify-between items-start gap-4">
          <div className="min-w-0">
            <p className="text-blue-100/60 font-black uppercase tracking-[0.3em] text-[9px] mb-3">
              {tr(t, "wallet.web3_deposit.your_balance_label", "Seu saldo")}
            </p>
            <div className="flex items-baseline gap-3 sm:gap-4 flex-wrap">
              <h2 className="text-3xl sm:text-6xl font-black tracking-tighter tabular-nums drop-shadow-2xl">
                {blkLoading
                  ? "···"
                  : blkAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 4,
                      maximumFractionDigits: 8,
                    })}
              </h2>
              <span className="text-lg sm:text-2xl font-black text-blue-200/80 italic">BLK</span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-white/50 mt-2">
              ≈ ${blkUsd} USD
              <span className="mx-2 text-white/25">·</span>
              <span className="text-blue-100/55">1 BLK ≈ 1 USD</span>
            </p>
            {balance.blkLocked > 0 && (
              <p className="text-[10px] font-bold text-amber-200/90 mt-2">
                {t("wallet.blk_locked_line", { amount: balance.blkLocked.toFixed(8) })}
              </p>
            )}
          </div>
          <div className="hidden sm:flex p-4 bg-white/10 backdrop-blur-2xl rounded-[1.5rem] border border-white/20">
            <Banknote className="w-8 h-8 text-blue-200" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:gap-8 pt-5 sm:pt-8 border-t border-white/10">
          <div className="space-y-1">
            <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t("wallet.total_withdrawn")}</p>
            <p className="text-lg font-black tracking-tight tabular-nums">
              {balance.totalWithdrawn.toFixed(4)} <span className="text-[10px] opacity-40">POL</span>
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t("wallet.network_status")}</p>
            <p className="text-lg font-black tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
              {t("wallet.network_polygon")}
            </p>
          </div>
        </div>

        <div className="pt-5 sm:pt-6 border-t border-white/10 space-y-3">
          <p className="text-blue-100/45 font-black uppercase tracking-[0.25em] text-[8px]">
            {tr(t, "wallet.withdrawable_assets", "Moedas sacáveis")}
          </p>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <CoinMark src="/media/icons/polygon.webp" ticker="POL" />
              <div className="min-w-0 flex-1 flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-tight">POL</p>
                  {polUsd != null && !polLoading && (
                    <p className="text-[11px] font-bold text-white/40">≈ ${polUsd} USD</p>
                  )}
                </div>
                <p className="text-lg sm:text-xl font-black tabular-nums tracking-tight">
                  {polLoading
                    ? "···"
                    : polAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 6,
                      })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <CoinMark src="/media/brand/shib.webp" ticker="SHIB" />
              <div className="min-w-0 flex-1 flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-sm font-black tracking-tight">SHIB</p>
                  <p className="text-[11px] font-bold text-orange-200/50">SHIBA INU</p>
                </div>
                <p className="text-lg sm:text-xl font-black tabular-nums tracking-tight text-orange-100">
                  {shibAmount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 4,
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute right-[-20px] bottom-[-20px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-1000 pointer-events-none">
        <WalletIcon className="w-64 h-64" />
      </div>
    </div>
  );
}

export function WalletLedgerPanel({
  transactions,
  polPrice,
  t,
}: {
  transactions: WalletTransactionRow[];
  polPrice: number;
  t: WalletTFunction;
}) {
  return (
    <div className="bg-slate-950/80 border border-slate-800/50 rounded-[2.5rem] p-4 sm:p-8 shadow-2xl flex flex-col max-h-[700px]">
      <div className="flex items-center justify-between mb-4 sm:mb-8">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          {t("wallet.ledger_title")}
        </h3>
        <ChevronRight className="w-4 h-4 text-slate-700" />
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-hide">
        {transactions.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-20">
            <QrCode className="w-12 h-12" />
            <p className="text-[10px] font-black uppercase tracking-widest">{t("wallet.ledger_empty")}</p>
          </div>
        ) : (
          transactions
            .filter((tx) => tx.type !== "burn_fee" && tx.type !== "energy_tax")
            .map((tx, i) => {
            const txKey =
              (typeof tx.txHash === "string" && tx.txHash.trim() !== "" ? tx.txHash : null) ??
              (typeof tx.createdAt === "string" && tx.createdAt
                ? tx.createdAt
                : typeof tx.created_at === "string" && tx.created_at
                  ? tx.created_at
                  : null) ??
              `${tx.type}-${tx.amount}-${i}`;
            const isBlkConvert = tx.type === "blk_convert";
            const isBlkWithdraw = tx.type === "blk_withdrawal";
            const isWithdrawal = tx.type === "withdrawal" || isBlkWithdraw;
            const unit = isBlkConvert || isBlkWithdraw ? "BLK" : "POL";
            const usdSub =
              isBlkConvert || isBlkWithdraw
                ? `≈ $${Number(tx.amount).toFixed(2)}`
                : polPrice > 0
                  ? `$${(Number(tx.amount) * polPrice).toFixed(2)}`
                  : null;
            const label = isBlkConvert
              ? t("wallet.tx_pol_to_blk")
              : isBlkWithdraw
                ? t("wallet.tx_blk_legacy")
                : isWithdrawal
                  ? t("wallet.tx_outflow")
                  : t("wallet.tx_inflow");
            return (
              <div
                key={txKey}
                className="group relative flex items-center gap-4 p-4 hover:bg-slate-900/50 rounded-2xl transition-all border border-transparent hover:border-slate-800/50"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                    isWithdrawal ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
                  }`}
                >
                  {isBlkConvert ? (
                    <Banknote className="w-6 h-6" />
                  ) : isWithdrawal ? (
                    <ArrowUpCircle className="w-6 h-6" />
                  ) : (
                    <ArrowDownCircle className="w-6 h-6" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-white italic uppercase tracking-tighter">{label}</span>
                    <WalletStatusBadge status={tx.status} t={t} />
                  </div>
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-bold text-slate-500 font-mono">
                      {new Date(tx.createdAt ?? tx.created_at ?? 0).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className={`text-sm font-black italic tracking-tighter ${isWithdrawal ? "text-red-400" : "text-emerald-400"}`}>
                      {isWithdrawal ? "-" : "+"}
                      {Number(tx.amount).toFixed(4)} {unit}
                      {usdSub && <span className="block text-[8px] opacity-50 not-italic text-right">{usdSub}</span>}
                    </p>
                  </div>
                </div>

                {tx.txHash && (
                  <a
                    href={`https://polygonscan.com/tx/${tx.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute right-0 top-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-primary"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 pt-4 sm:mt-8 sm:pt-8 border-t border-slate-900">
        <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10 flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight leading-relaxed">
            All transactions are secured by Polygon Smart Contracts and verified on-chain.
          </p>
        </div>
      </div>
    </div>
  );
}
