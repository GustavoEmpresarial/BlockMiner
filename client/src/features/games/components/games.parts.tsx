import React, { memo } from "react";
import type { MutableRefObject } from "react";
import type { LucideIcon } from "lucide-react";
import { formatHashrate } from "../../machines/lib/machines.shared";
import { Link } from "react-router-dom";
import { Brain, LayoutGrid, Trophy, Clock, Zap, RotateCcw, Play, Grid3X3, Car, Layers, Plane } from "lucide-react";
import AdRotator, { LEADERBOARD_ADS, POWER_STATS_ADS_300 } from "./AdRotator";
import { t, type TranslateFn } from "../lib/games.i18n";


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
      className={`min-w-0 flex-1 overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-500/15 via-amber-600/5 to-slate-900/40 px-3 py-3 shadow-lg transition-all duration-300 sm:max-w-md sm:px-4 lg:max-w-lg ${flash ? "ring-2 ring-amber-400/70 sm:scale-[1.01]" : ""}`}
      title={tooltip}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/25 text-amber-300 shadow-inner"
          aria-hidden
        >
          <Zap className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-wide text-amber-200/90 sm:tracking-[0.2em]">
            {t("games.temporary_power_label")}
          </p>
          {errorKey ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm text-red-400">{t("minerGames.power_error")}</span>
              <button
                type="button"
                onClick={onRetry}
                className="touch-manipulation rounded px-1 text-xs font-bold uppercase tracking-wider text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {t("minerGames.retry")}
              </button>
            </div>
          ) : (
            <>
              <p
                className="mt-0.5 text-xl font-black tabular-nums tracking-tight text-white sm:text-2xl"
                aria-live="polite"
                aria-label={`${t("games.temporary_power_label")}: ${loading ? t("minerGames.loading_power") : formatHashrate(totalGamePower)}`}
              >
                {loading ? t("minerGames.loading_power") : formatHashrate(totalGamePower)}
              </p>
              {!loading && totalGamePower <= 0 && (
                <p className="text-[10px] font-medium text-slate-500">{t("minerGames.no_active_bonus")}</p>
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
    "group relative block overflow-hidden rounded-3xl border p-6 text-left shadow-2xl transition-all duration-500 sm:rounded-[3rem] sm:p-8 lg:rounded-[4rem] lg:p-12";
  const activeCls = `${base} border-slate-800 bg-slate-900 hover:-translate-y-4 hover:border-primary`;
  const disabledCls = `${base} cursor-not-allowed border-slate-800/80 bg-slate-950 opacity-[0.42] grayscale`;

  const inner = (
    <>
      <div
        className={`absolute -right-12 -top-12 h-48 w-48 bg-gradient-to-br ${color} blur-[70px] transition-all duration-700 sm:h-72 sm:w-72 sm:blur-[90px] ${disabled ? "opacity-5" : "opacity-10 group-hover:opacity-30"}`}
      />
      <div
        className={`mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br ${color} shadow-2xl transition-transform duration-500 sm:mb-10 sm:h-24 sm:w-24 sm:rounded-[2rem] lg:mb-12 lg:h-28 lg:w-28 lg:rounded-[3rem] ${disabled ? "" : "group-hover:rotate-12"}`}
      >
        {React.createElement(icon, {
          className: "h-10 w-10 text-white sm:h-12 sm:w-12 lg:h-14 lg:w-14",
          "aria-hidden": true
        })}
      </div>
      <h3 className="mb-4 break-words text-2xl font-black uppercase italic leading-none tracking-tight text-white sm:mb-6 sm:text-3xl lg:text-4xl">
        {title}
      </h3>
      <p className="mb-6 text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200">
        {description}
      </p>
      {disabled && cooldownMinutes > 0 ? (
        <p className="mb-6 text-sm font-black uppercase tracking-wide text-amber-400/90">
          {t("game2048.arena_cooldown_minutes", { minutes: cooldownMinutes })}
        </p>
      ) : null}
      {disabled ? (
        <div className="text-xs font-black uppercase tracking-wide text-slate-500 sm:tracking-[0.35em]">
          {t("game2048.arena_unavailable")}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-wide text-primary transition-all duration-500 sm:gap-5 sm:tracking-[0.4em] md:translate-y-6 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
          {ctaLabel} <Play className="h-4 w-4 fill-current" aria-hidden />
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
      className={`group relative overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/40 p-6 text-left shadow-2xl transition-all duration-500 backdrop-blur-sm sm:rounded-[3rem] sm:p-8 lg:rounded-[4rem] lg:p-12 ${disabled ? "cursor-not-allowed opacity-40 grayscale" : "hover:-translate-y-4 hover:border-primary hover:shadow-primary/20"}`}
    >
      {/* Decorative Corner */}
      <div className="absolute left-0 top-0 h-12 w-12 border-l-2 border-t-2 border-white/10 transition-colors group-hover:border-primary/50" />

      <div
        className={`absolute -right-12 -top-12 h-48 w-48 bg-gradient-to-br ${color} blur-[70px] transition-all duration-700 sm:h-72 sm:w-72 sm:blur-[90px] ${disabled ? "opacity-10" : "opacity-10 group-hover:opacity-40"}`}
      />
      <div
        className={`mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-white/10 bg-gradient-to-br ${color} shadow-[0_0_30px_rgba(0,0,0,0.3)] transition-all duration-500 sm:mb-10 sm:h-24 sm:w-24 sm:rounded-[2.5rem] lg:mb-12 lg:h-32 lg:w-32 lg:rounded-[3.5rem] ${!disabled && "group-hover:rotate-[10deg] group-hover:scale-110"}`}
      >
        {React.createElement(icon, {
          className: "h-10 w-10 text-white drop-shadow-lg sm:h-12 sm:w-12 lg:h-16 lg:w-16",
          "aria-hidden": true
        })}
      </div>
      <h3 className="mb-4 break-words text-2xl font-black uppercase italic leading-none tracking-tighter text-white sm:mb-6 sm:text-3xl lg:text-5xl">
        {title}
      </h3>
      <p className="mb-8 text-sm font-medium leading-relaxed text-slate-400 transition-colors group-hover:text-slate-200 sm:mb-10 lg:mb-12">
        {description}
      </p>
      <div className="flex items-center gap-3 text-xs font-black uppercase tracking-[0.2em] text-primary transition-all duration-500 sm:gap-5 sm:tracking-[0.4em] md:translate-y-6 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
        {disabled ? (
          <span className="text-amber-500/80">{cooldownLabel}</span>
        ) : (
          <>
            {ctaStart} <Play className="h-4 w-4 fill-current" aria-hidden />
          </>
        )}
      </div>
    </button>
  );
});

