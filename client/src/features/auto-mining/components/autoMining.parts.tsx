import { useEffect } from "react";
import type { TFunction } from "i18next";
import { BarChart3, CheckCircle2, History } from "lucide-react";
import { useBrazilDailyResetCountdown } from "../../../shared/hooks/useBrazilDailyResetCountdown";

export function AutoMiningDailyResetBanner({
  dailyReset,
  t,
  onResetElapsed,
}: {
  dailyReset: { localDate: string; nextResetInMs: number };
  t: TFunction;
  onResetElapsed: () => Promise<void>;
}) {
  const { label, remainingMs } = useBrazilDailyResetCountdown(dailyReset.nextResetInMs);

  useEffect(() => {
    if (remainingMs > 0) return undefined;
    void onResetElapsed();
    return undefined;
  }, [remainingMs, onResetElapsed]);

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90">
          {t("autoMiningGpuPage.daily_reset_title", { date: dailyReset.localDate })}
        </p>
        <p className="mt-1 text-xs font-medium text-gray-400">{t("autoMiningGpuPage.daily_reset_body")}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{t("autoMiningGpuPage.daily_reset_next")}</p>
        <p className="text-lg font-black tabular-nums text-emerald-300">{label}</p>
      </div>
    </div>
  );
}

export function TrackerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
      <span className="text-sm font-black text-white italic tabular-nums">{value}</span>
    </div>
  );
}

export type AutoMiningSidebarProps = {
  t: TFunction;
  dailyUsed: number;
  dailyRemaining: number;
  dailyLimit: number;
  activeHashTotal: number;
  dailyPct: number;
  sessionEarnings: number;
  nearest: { hashRate: number | string; expiresAt: string } | undefined;
  recentGrants: Array<{ id: string; earnedAt: string; mode: string; hashRate: number | string }>;
};

export function AutoMiningSidebar({
  t,
  dailyUsed,
  dailyRemaining,
  dailyLimit,
  activeHashTotal,
  dailyPct,
  sessionEarnings,
  nearest,
  recentGrants,
}: AutoMiningSidebarProps) {
  return (
    <div className="space-y-8">
      <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-5">
          <BarChart3 className="w-20 h-20 text-primary" />
        </div>
        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" /> Stats
        </h3>
        <TrackerRow label={t("autoMiningGpuPage.daily_used")} value={`${dailyUsed.toFixed(0)} / ${dailyLimit} H/s`} />
        <TrackerRow label={t("autoMiningGpuPage.daily_remaining")} value={`${dailyRemaining.toFixed(0)} H/s`} />
        <p className="text-[9px] text-gray-600 font-bold uppercase">{t("autoMiningGpuPage.daily_limit_note")}</p>
        <TrackerRow label={t("autoMiningGpuPage.active_hash_total")} value={`${activeHashTotal.toFixed(0)} H/s`} />
        <p className="text-[9px] text-gray-600 font-bold uppercase leading-relaxed">{t("autoMiningGpuPage.active_hash_note")}</p>
        <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden border border-white/5">
          <div className="h-full bg-gradient-to-r from-primary to-blue-500 transition-all" style={{ width: `${dailyPct}%` }} />
        </div>
        <TrackerRow label={t("autoMiningGpuPage.session_earnings")} value={`${sessionEarnings.toFixed(0)} H/s`} />
        <div className="h-px bg-gray-800" />
        <div>
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{t("autoMiningGpuPage.nearest_expiry")}</p>
          {nearest ? (
            <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
              <span className="text-[10px] font-black text-emerald-400">+{nearest.hashRate} H/s</span>
              <span className="text-[9px] text-gray-500 font-bold">{new Date(nearest.expiresAt).toLocaleString()}</span>
            </div>
          ) : (
            <p className="text-[10px] text-gray-600 font-bold uppercase italic">{t("autoMiningGpuPage.no_active_power")}</p>
          )}
        </div>
      </div>

      <div className="bg-gray-950/50 border border-gray-800 rounded-[2.5rem] p-8 shadow-xl space-y-6">
        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] flex items-center gap-2">
          <History className="w-3 h-3" /> {t("autoMiningGpuPage.recent_grants")}
        </h3>
        <div className="space-y-3 max-h-[360px] overflow-y-auto scrollbar-hide pr-1">
          {recentGrants.length === 0 ? (
            <p className="text-[10px] text-gray-700 font-black uppercase text-center py-8 italic">—</p>
          ) : (
            recentGrants.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between p-4 bg-gray-900/50 rounded-2xl border border-gray-800/50"
              >
                <div>
                  <p className="text-[9px] font-black text-white italic">{new Date(g.earnedAt).toLocaleString()}</p>
                  <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">{g.mode}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-emerald-400">+{g.hashRate} H/s</span>
                  <span className="text-[7px] font-bold text-gray-700 uppercase flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {t("autoMiningGpuPage.verified")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
