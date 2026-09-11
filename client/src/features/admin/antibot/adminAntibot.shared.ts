export type RiskBand = 'trusted' | 'low' | 'suspicious' | 'high' | 'critical';

export function bandForScore(score: number): RiskBand {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  if (s >= 85) return 'critical';
  if (s >= 65) return 'high';
  if (s >= 40) return 'suspicious';
  if (s >= 15) return 'low';
  return 'trusted';
}

export const BAND_STYLE: Record<
  RiskBand,
  { label: string; badge: string; bar: string; chip?: string; dot?: string }
> = {
  trusted: {
    label: 'Confiável',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    bar: 'bg-emerald-500',
  },
  low: {
    label: 'Baixo',
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    bar: 'bg-sky-500',
  },
  suspicious: {
    label: 'Suspeito',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    bar: 'bg-amber-500',
  },
  high: {
    label: 'Alto',
    badge: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    bar: 'bg-orange-500',
  },
  critical: {
    label: 'Crítico',
    badge: 'border-red-500/30 bg-red-500/10 text-red-300',
    bar: 'bg-red-500',
  },
};

export const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/15 text-red-300',
  high: 'border-orange-500/40 bg-orange-500/15 text-orange-300',
  medium: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  low: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  info: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
};

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { hour12: false });
  } catch {
    return iso;
  }
}
