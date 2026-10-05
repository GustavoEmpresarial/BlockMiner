import React, { memo } from "react";
import type { MutableRefObject } from "react";
import type { LucideIcon } from "lucide-react";
import { formatHashrate } from "../../machines/lib/machines.shared";
import { Link } from "react-router-dom";
import { Brain, LayoutGrid, Trophy, Clock, Zap, RotateCcw, Play, Grid3X3, Car, Layers, Plane } from "lucide-react";
import AdRotator, { LEADERBOARD_ADS, POWER_STATS_ADS_300 } from "./AdRotator";
import { t, type TranslateFn } from "../lib/games.i18n";
import IconBadge from "../../../shared/components/IconBadge";


export type TemporaryPowerSummaryProps = {
  t: TranslateFn;
  totalGamePower: number;
  loading: boolean;
  errorKey: string | null;
  flash: boolean;
  onRetry: () => void;
};

export function TemporaryPowerSummary({ t, totalGamePower, loading, errorKey, flash, onRetry }: TemporaryPowerSummaryProps) {
  const tooltip = t("minerGames.temporary_power_tooltip");
  return (
    <div
      className={`min-w-0 flex-1 overflow-hidden rounded-2xl border-2 border-amber-500/30 bg-amber-950/20 px-4 py-3 shadow-[2px_2px_0px_#000000] transition-all duration-300 sm:max-w-md lg:max-w-lg ${flash ? "ring-2 ring-amber-400 sm:scale-[1.01]" : ""}`}
      title={tooltip}
    >
      <div className="flex items-center gap-3">
        <IconBadge icon={Zap} variant="amber" size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wide text-amber-300">
            {t("games.temporary_power_label")}
          </p>
          {errorKey ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-xs text-red-400 font-bold">{t("minerGames.power_error")}</span>
              <button
                type="button"
                onClick={onRetry}
                className="touch-manipulation rounded px-1 text-xs font-black uppercase tracking-wider text-primary hover:underline outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {t("minerGames.retry")}
              </button>
            </div>
          ) : (
            <>
              <p
                className="mt-0.5 text-xl font-black tabular-nums tracking-tight text-white sm:text-2xl font-mono"
                aria-live="polite"
                aria-label={`${t("games.temporary_power_label")}: ${loading ? t("minerGames.loading_power") : formatHashrate(totalGamePower)}`}
              >
                {loading ? t("minerGames.loading_power") : formatHashrate(totalGamePower)}
              </p>
              {!loading && totalGamePower <= 0 && (
                <p className="text-[10px] font-medium text-slate-400">{t("minerGames.no_active_bonus")}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


export type GameCardLinkProps = {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  ctaLabel: string;
  disabled?: boolean;
  cooldownMinutes?: number;
};

/**
 * Link-style game card (e.g. Chain 2048) — navigates via React Router instead of onClick.
 */

export const GameCardLink = memo(function GameCardLink({
  to,
  title,
  description,
  icon,
  color,
  ctaLabel,
  disabled = false,
  cooldownMinutes = 0
}: GameCardLinkProps) {
  const base =
    "group relative block overflow-hidden rounded-3xl border-2 p-6 text-left shadow-[4px_4px_0px_#000000] transition-all duration-300 sm:p-8";
  const activeCls = `${base} border-slate-800 bg-slate-900/60 hover:border-slate-700 active:translate-x-0.5 active:translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary`;
  const disabledCls = `${base} cursor-not-allowed border-slate-800/80 bg-slate-950/60 opacity-[0.42] grayscale`;

  const inner = (
    <>
      <div
        className={`absolute -right-12 -top-12 h-48 w-48 bg-gradient-to-br ${color} blur-[70px] transition-all duration-500 sm:h-72 sm:w-72 sm:blur-[90px] ${disabled ? "opacity-5" : "opacity-10 group-hover:opacity-30"}`}
      />
      <div
        className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/10 bg-gradient-to-br ${color} shadow-[2px_2px_0px_#000000] transition-transform duration-300 sm:h-20 sm:w-20 ${disabled ? "" : "group-hover:rotate-6"}`}
      >
        {React.createElement(icon, {
          className: "h-8 w-8 text-white sm:h-10 sm:w-10",
          "aria-hidden": true
        })}
      </div>
      <h3 className="mb-3 break-words text-2xl font-black uppercase italic leading-none tracking-tight text-white sm:text-3xl">
        {title}
      </h3>
      <p className="mb-6 text-xs sm:text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200">
        {description}
      </p>
      {disabled && cooldownMinutes > 0 ? (
        <p className="mb-4 text-xs font-black uppercase tracking-wide text-amber-400">
          {t("game2048.arena_cooldown_minutes", { minutes: cooldownMinutes })}
        </p>
      ) : null}
      {disabled ? (
        <div className="text-xs font-black uppercase tracking-wide text-slate-500">
          {t("game2048.arena_unavailable")}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary transition-all duration-300">
          {ctaLabel} <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
        </div>
      )}
    </>
  );

  if (disabled) {
    return (
      <div className={disabledCls} aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link to={to} className={activeCls}>
      {inner}
    </Link>
  );
});


export type GameCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  onClick: () => void;
  disabled: boolean;
  ctaStart: string;
  cooldownLabel: string;
};

export const GameCard = memo(function GameCard({
  title,
  description,
  icon,
  color,
  onClick,
  disabled,
  ctaStart,
  cooldownLabel
}: GameCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-6 sm:p-8 text-left shadow-[4px_4px_0px_#000000] transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-primary ${disabled ? "cursor-not-allowed opacity-40 grayscale" : "hover:border-slate-700 active:translate-x-0.5 active:translate-y-0.5"}`}
    >
      <div
        className={`absolute -right-12 -top-12 h-48 w-48 bg-gradient-to-br ${color} blur-[70px] transition-all duration-500 sm:h-72 sm:w-72 sm:blur-[90px] ${disabled ? "opacity-10" : "opacity-10 group-hover:opacity-30"}`}
      />
      <div
        className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-white/10 bg-gradient-to-br ${color} shadow-[2px_2px_0px_#000000] transition-all duration-300 sm:h-20 sm:w-20 ${!disabled && "group-hover:rotate-6 group-hover:scale-105"}`}
      >
        {React.createElement(icon, {
          className: "h-8 w-8 text-white drop-shadow sm:h-10 sm:w-10",
          "aria-hidden": true
        })}
      </div>
      <h3 className="mb-3 break-words text-2xl font-black uppercase italic leading-none tracking-tight text-white sm:text-3xl">
        {title}
      </h3>
      <p className="mb-6 text-xs sm:text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200">
        {description}
      </p>
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary transition-all duration-300">
        {disabled ? (
          <span className="text-amber-400 font-bold">{cooldownLabel}</span>
        ) : (
          <>
            {ctaStart} <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
          </>
        )}
      </div>
    </button>
  );
});

