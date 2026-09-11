/** Hashrate display (matches production stats bundle). */
export function formatHashrate(value: unknown): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let scaled = n;
  let unitIndex = 0;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }
  const digits = scaled >= 100 ? 1 : 2;
  return `${scaled.toFixed(digits)} ${units[unitIndex]}`;
}

export function utcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Chart axis label for a UTC calendar day key (YYYY-MM-DD). */
export function formatUtcChartDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number);
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const mon = months[(month ?? 1) - 1] ?? dateKey;
  return `${String(day).padStart(2, '0')} ${mon} UTC`;
}

export function formatUtcDayStartLabel(dateKey: string): string {
  return `${dateKey} 00:00:00 UTC`;
}

/** Alias used by some stats panels for POL amounts (prefer formatPolAmount from earnings API for locale). */
export function formatPol(value: number, locale?: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat(locale || 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: n >= 100 ? 2 : 8,
  }).format(n);
}
