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
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-black/70 px-2 py-2 sm:px-4">
      <div className="flex min-w-0 flex-col">
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
          {t("minerGames.hash_score_label")}
        </span>
        <span className="max-w-[6rem] truncate text-lg font-black leading-none text-white sm:max-w-none sm:text-xl">
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
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
              {t("minerGames.time_sync_label")}
            </span>
            <div className="flex items-center gap-1 text-lg font-black leading-none text-primary sm:text-xl">
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
            className="rounded-lg border border-red-500/30 bg-red-500/20 p-2 text-red-400 transition-all hover:bg-red-500/40"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
