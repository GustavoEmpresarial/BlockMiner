import { useEffect, useState, type FormEvent } from "react";
import { ArrowDownToLine, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../shared/auth/auth.store";
import { useTranslation } from "react-i18next";

/** Flat fee shown in SPA — must match server `SHIB_WITHDRAW_FEE` default. */
export const SHIB_WITHDRAW_FEE = 7800;

type Props = {
  balance: number;
  onRefresh: () => void;
};

/**
 * SHIB ERC20 withdraw form (was top-level wallet tab; now nested under Sacar).
 */
export function ShibPanel({ balance, onRefresh }: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [minShib, setMinShib] = useState<number | null>(null);

  useEffect(() => {
    function fetchMin() {
      api
        .get("/wallet/shib/withdraw-min")
        .then((res) => {
          if (res.data?.ok) setMinShib(Number(res.data.minShib) || 0);
        })
        .catch(() => {});
    }
    fetchMin();
    const interval = setInterval(fetchMin, 300 * 1000);
    return () => clearInterval(interval);
  }, []);

  const effectiveMin = minShib ?? 0;
  const net = Number(amount) - SHIB_WITHDRAW_FEE;

  async function handleWithdraw(e: FormEvent) {
    e.preventDefault();
    if (effectiveMin > 0 && Number(amount) < effectiveMin) {
      toast.error(t("wallet.shib.min_amount", { amount: Math.ceil(effectiveMin).toLocaleString("en-US") }));
      return;
    }
    if (Number(amount) + SHIB_WITHDRAW_FEE > balance) {
      toast.error(
        t("wallet.shib.insufficient_with_fee", {
          amount: (Number(amount) + SHIB_WITHDRAW_FEE).toLocaleString("en-US"),
        }),
      );
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/wallet/shib/withdraw", { amount: Number(amount), address });
      if (res.data?.ok) {
        toast.success(res.data.message ?? t("wallet.shib.withdraw_submitted"));
        setAmount("");
        setAddress("");
        onRefresh();
      } else {
        toast.error(res.data?.message ?? t("common.error"));
      }
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; code?: string } } })?.response?.data;
      toast.error(
        data?.code === "EMAIL_NOT_VERIFIED"
          ? t("auth.verifyEmail.banner_body")
          : (data?.message ?? t("wallet.shib.withdraw_error")),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-5 bg-orange-950/20 border-2 border-orange-500/30 rounded-2xl shadow-[2px_2px_0px_#000000]">
        <img
          src="/media/brand/shib.webp"
          alt="SHIB"
          className="w-12 h-12 rounded-full shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div>
          <p className="text-orange-200/50 font-black uppercase tracking-widest text-[9px] mb-0.5">
            {t("wallet.shib.balance_label")}
          </p>
          <p className="text-3xl font-black tabular-nums text-orange-100">
            {parseFloat(balance.toFixed(2)).toString()}
            <span className="text-lg text-orange-300/70 ml-2">SHIB</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleWithdraw} className="space-y-5">
        <div className="p-4 bg-amber-950/20 border-2 border-amber-500/30 rounded-2xl flex gap-3 shadow-[2px_2px_0px_#000000]">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[10px] text-slate-400 font-medium space-y-1">
            <p>
              {t("wallet.shib.network")}{" "}
              <span className="text-white font-black">{t("wallet.shib.network_value")}</span>
            </p>
            <p>
              {t("wallet.shib.default_fee")}{" "}
              <span className="text-orange-300 font-black">{SHIB_WITHDRAW_FEE.toLocaleString()} SHIB</span>
            </p>
            <p>
              {t("wallet.shib.minimum")}{" "}
              {minShib !== null ? (
                <>
                  <span className="text-orange-300 font-black">
                    {Math.ceil(minShib).toLocaleString("en-US")} SHIB
                  </span>
                  <span className="text-gray-500 ml-1">($0.10)</span>
                </>
              ) : (
                <span className="text-gray-500">{t("wallet.shib.loading")}</span>
              )}
            </p>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
            {t("wallet.shib.amount_label")}
          </label>
          <input
            type="number"
            step="0.1"
            min={effectiveMin > 0 ? effectiveMin : undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={
              minShib !== null
                ? t("wallet.shib.min_placeholder", { amount: Math.ceil(minShib).toLocaleString("en-US") })
                : t("wallet.shib.amount_placeholder")
            }
            className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-orange-500 transition-colors shadow-[2px_2px_0px_#000000]"
            required
          />
          {Number(amount) > 0 && (
            <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
              {t("wallet.shib.you_receive")}{" "}
              <span className="text-orange-300 font-black">
                {Math.max(0, net).toLocaleString("en-US", { maximumFractionDigits: 2 })} SHIB
              </span>{" "}
              {t("wallet.shib.fee_deducted", { fee: SHIB_WITHDRAW_FEE.toLocaleString("en-US") })}
            </p>
          )}
        </div>

        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
            {t("wallet.shib.address_label")}
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x..."
            className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-orange-500 transition-colors shadow-[2px_2px_0px_#000000]"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !amount || !address}
          className="w-full py-4 bg-orange-600 hover:bg-orange-500 active:translate-x-0.5 active:translate-y-0.5 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[2px_2px_0px_#000000] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <ArrowDownToLine className="w-5 h-5" />
          )}
          {t("wallet.shib.withdraw_btn")}
        </button>
      </form>
    </div>
  );
}
