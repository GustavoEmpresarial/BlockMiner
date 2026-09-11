import { formatUtcDayStartLabel } from './format';
import type { UserPowerStatsPayload } from '../lib/stats.api';
import type { UserEarningsPayload } from '../lib/stats.earnings.api';

function formatUtcDateTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const o = new Date(iso);
  const pad = (a: number) => String(a).padStart(2, '0');
  return `${o.getUTCFullYear()}-${pad(o.getUTCMonth() + 1)}-${pad(o.getUTCDate())} ${pad(o.getUTCHours())}:${pad(o.getUTCMinutes())}:${pad(o.getUTCSeconds())} UTC`;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const blob = new Blob(
    [rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')],
    { type: 'text/csv;charset=utf-8;' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPowerStatsCsv(power: UserPowerStatsPayload, basename: string): void {
  const rows: string[][] = [['section', 'field', 'value']];
  const push = (section: string, field: string, value: unknown) => {
    rows.push([section, field, String(value ?? '')]);
  };
  push('overview', 'totalHashrate', power.overview?.totalHashrate);
  push('overview', 'permanentHashrate', power.overview?.permanentHashrate);
  push('overview', 'temporaryHashrate', power.overview?.temporaryHashrate);
  for (const [i, m] of (power.machines?.items || []).entries()) {
    push('machine', `slot_${i}`, `${m.minerName},${m.hashRate},active=${m.isActive}`);
  }
  downloadCsv(`${basename}.csv`, rows);
}

export function exportEarningsStatsCsv(earnings: UserEarningsPayload, basename: string): void {
  const rows: string[][] = [
    ['section', 'field', 'value', 'extra'],
    ['meta', 'generatedAtUtc', formatUtcDateTime(earnings.generatedAtUtc), ''],
    ['meta', 'fromUtc', formatUtcDateTime(earnings.fromUtc), ''],
    ['meta', 'toUtc', formatUtcDateTime(earnings.toUtc), ''],
    ['meta', 'period', earnings.period ?? '', ''],
  ];
  const total = earnings.total || 1;
  const categories: Array<[string, number]> = [
    ['mining', earnings.mining],
    ['offerwall', earnings.offerwall],
    ['faucet', earnings.faucet],
    ['shortlinks', earnings.shortlinks],
    ['autoMining', earnings.autoMining],
    ['games', earnings.games],
    ['youtube', earnings.youtube],
    ['checkin', earnings.checkin],
    ['referrals', earnings.referrals],
  ];
  for (const [key, amount] of categories) {
    rows.push(['category', key, String(amount), String(Math.round((amount / total) * 1000) / 10)]);
  }
  rows.push(['category', 'total', String(earnings.total), '100']);
  for (const point of earnings.history || []) {
    rows.push(['history_day', formatUtcDayStartLabel(point.date), String(point.total), point.date]);
  }
  downloadCsv(`${basename}-earnings.csv`, rows);
}

export const exportEarningsCsv = exportEarningsStatsCsv;
