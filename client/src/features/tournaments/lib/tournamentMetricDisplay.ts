import i18n from 'i18next';
import { formatHashrate } from '../../ranking/lib/ranking.utils';

export const TOURNAMENT_TYPE_BADGE: Record<string, string> = {
  DAILY: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  WEEKLY: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  MONTHLY: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  CUSTOM: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
};

export function isDepositMetric(metric: string): boolean {
  return metric === 'DEPOSITS_USD' || metric === 'DEPOSITS_POL';
}

export function isMinigameMetric(metric: string): boolean {
  return metric === 'MINIGAME_WINS';
}

export function isOffersMetric(metric: string): boolean {
  return metric === 'OFFERS_ALL' || metric === 'OFFERS_EXTERNAL' || metric === 'OFFERS_INTERNAL';
}

export function scoreColumnI18nKey(metric: string): string {
  if (isMinigameMetric(metric)) return 'tournaments.minigame_wins_column';
  if (metric === 'DEPOSITS_USD') return 'tournaments.deposit_rank_column';
  if (metric === 'DEPOSITS_POL') return 'tournaments.deposit_rank_column_pol';
  return `tournaments.metrics.${metric}`;
}

export function scoreTotalI18nKey(metric: string): string {
  if (isOffersMetric(metric)) return 'tournaments.offers_total';
  if (isMinigameMetric(metric)) return 'tournaments.minigame_wins_total';
  if (metric === 'DEPOSITS_USD') return 'tournaments.deposit_rank_total_label';
  if (metric === 'DEPOSITS_POL') return 'tournaments.deposit_rank_total_label_pol';
  return 'tournaments.score';
}

function formatUsd(value: number): string {
  const locale = i18n.language || 'pt-BR';
  const abs = Math.abs(value);
  const fractionDigits = abs > 0 && abs < 1 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatPolAmount(value: number): string {
  return `${value.toFixed(4)} POL`;
}

export function formatScoreValue(metric: string, score: number): string {
  if (metric === 'DEPOSITS_USD') return formatUsd(score);
  if (metric === 'DEPOSITS_POL') return formatPolAmount(score);
  return String(score);
}

export function formatScoreWithPolHint(
  metric: string,
  score: number,
  polHint?: number | null,
): { primary: string; secondary?: string } {
  if (metric === 'DEPOSITS_USD') {
    return {
      primary: formatUsd(score),
      secondary: polHint != null && polHint > 0 ? formatPolAmount(polHint) : undefined,
    };
  }
  if (metric === 'DEPOSITS_POL') {
    return { primary: formatPolAmount(score) };
  }
  return { primary: String(score) };
}

export function formatMyScoreTotal(metric: string, score: number): string {
  if (metric === 'HASHRATE') return formatHashrate(score);
  if (isDepositMetric(metric)) return formatScoreValue(metric, score);
  return score.toLocaleString();
}

export function prizeRankBadgeClass(rankFrom: number): string {
  if (rankFrom === 1) return 'bg-amber-500 text-slate-950';
  if (rankFrom === 2) return 'bg-slate-300 text-slate-950';
  if (rankFrom === 3) return 'bg-orange-700 text-white';
  return 'bg-slate-700 text-slate-300';
}
