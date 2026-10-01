/**
 * Shared admin formatters for bytes, durations and human-readable units.
 */

const BYTES_PER_KB = 1000;
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

export function formatBytes(bytes: unknown): string {
  if (bytes == null || !Number.isFinite(Number(bytes))) return '—';
  const n = Number(bytes);
  if (n < 0) return '—';
  if (n === 0) return '0 B';
  const i = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(n) / Math.log(BYTES_PER_KB))
  );
  return parseFloat((n / Math.pow(BYTES_PER_KB, i)).toFixed(2)) + ' ' + BYTE_UNITS[i];
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0d 0h 0m';
  const d = Math.floor(seconds / SECONDS_PER_DAY);
  const h = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const m = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  return `${d}d ${h}h ${m}m`;
}
