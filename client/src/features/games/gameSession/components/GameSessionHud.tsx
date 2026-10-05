import type { TranslateFn } from "../../lib/games.i18n";
import { Clock, RotateCcw } from "lucide-react";

interface GameSessionHudProps {
  hudScore: number;
  timeLeft: number;
  isGameOver: boolean;
  onExit: () => void;
  t: TranslateFn;
}

/** Top bar for an active game session: hash score, brand, countdown and exit. */
export function GameSessionHud({ hudScore, timeLeft, isGameOver, onExit, t }: GameSessionHudProps) {
  const showTimer = timeLeft > 0;
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-slate-800 bg-slate-950/80 backdrop-blur-md px-3 py-2.5 sm:px-4 shadow-[2px_2px_0px_#000000]">
      <div className="flex min-w-0 flex-col">
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
          {t("minerGames.hash_score_label")}
        </span>
        <span className="max-w-[6rem] truncate text-lg font-black leading-none text-white sm:max-w-none sm:text-xl font-mono">
          {hudScore}
        </span>
      </div>
      <h1 className="min-w-0 flex-1 text-center text-xs font-black uppercase italic tracking-tight text-white sm:text-sm">
        {t("minerGames.brand_prefix")}
        <span className="text-primary">{t("minerGames.brand_suffix")}</span>
      </h1>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {showTimer ? (
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
              {t("minerGames.time_sync_label")}
            </span>
            <div className="flex items-center gap-1 text-lg font-black leading-none text-primary sm:text-xl font-mono">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              <span>{t("minerGames.time_value_seconds", { seconds: timeLeft })}</span>
            </div>
          </div>
        ) : null}
        {!isGameOver && (
          <button
            type="button"
            onClick={onExit}
            aria-label={t("minerGames.exit_session_aria")}
            className="rounded-xl border border-red-500/40 bg-red-950/30 p-2 text-red-400 hover:bg-red-900/40 active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-red-400 transition-all"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
