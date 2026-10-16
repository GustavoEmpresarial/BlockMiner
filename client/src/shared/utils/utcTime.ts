/**
 * UTC-only date/time formatting. Product rule: every date/time shown to users and
 * admins is in UTC (server + DB run in UTC). Never format a Date for display with the
 * browser's local timezone — use these helpers instead.
 *
 * Exception: antibot/telemetry code that reads the browser's REAL timezone
 * (Intl.DateTimeFormat().resolvedOptions().timeZone / getTimezoneOffset) as a signal.
 */
import i18n from 'i18next';

export { utcDateKey, formatUtcChartDay, formatUtcDayStartLabel } from '../../features/stats/utils/format';
export { formatUtcResetCountdown, useUtcDailyResetCountdown } from '../hooks/useUtcDailyResetCountdown';

export type UtcDateInput = Date | string | number | null | undefined;

export type UtcFormatOptions = Omit<Intl.DateTimeFormatOptions, 'timeZone'> & {
  /** BCP-47 locale; defaults to the active i18n language (fallback pt-BR). */
  locale?: string;
  /** Returned for null/undefined/invalid input. Default '—'. */
  fallback?: string;
  /** Append " UTC". Defaults: true for date-time/time, false for date-only. */
  showUtc?: boolean;
  /** Add seconds to the resolved shape (keeps the default date/time components). */
  seconds?: boolean;
};

const COMPONENT_KEYS: readonly string[] = [
  'weekday', 'era', 'year', 'month', 'day', 'hour', 'minute', 'second',
  'dateStyle', 'timeStyle', 'fractionalSecondDigits', 'dayPeriod', 'timeZoneName',
];

const DATE_TIME_DEFAULTS: Intl.DateTimeFormatOptions = {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
};
const DATE_DEFAULTS: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
const TIME_DEFAULTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/** Active UI locale (i18n.language), falling back to pt-BR (product default). */
export function currentUtcLocale(): string {
  const lang = (i18n && typeof i18n.language === 'string' ? i18n.language : '').trim();
  return lang || 'pt-BR';
}

/** Parses the input into a valid Date, or null. */
export function toValidDate(value: UtcDateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function format(
  value: UtcDateInput,
  opts: UtcFormatOptions | undefined,
  defaults: Intl.DateTimeFormatOptions,
  defaultShowUtc: boolean,
): string {
  const { locale, fallback = '—', showUtc = defaultShowUtc, seconds = false, ...intl } = opts ?? {};
  const d = toValidDate(value);
  if (!d) return fallback;
  const intlRecord = intl as Record<string, unknown>;
  const hasComponents = COMPONENT_KEYS.some((k) => intlRecord[k] !== undefined);
  const resolved: Intl.DateTimeFormatOptions = { ...(hasComponents ? {} : defaults), ...intl, timeZone: 'UTC' };
  if (seconds && !resolved.timeStyle) resolved.second = '2-digit';
  let out: string;
  try {
    out = new Intl.DateTimeFormat(locale || currentUtcLocale(), resolved).format(d);
  } catch {
    out = new Intl.DateTimeFormat('en', resolved).format(d);
  }
  return showUtc ? `${out} UTC` : out;
}

/** Date + time in UTC, e.g. "10/10/2026, 14:05 UTC". */
export function formatUtcDateTime(value: UtcDateInput, opts?: UtcFormatOptions): string {
  return format(value, opts, DATE_TIME_DEFAULTS, true);
}

/** Date-only in UTC, e.g. "10/10/2026" (no suffix by default). */
export function formatUtcDate(value: UtcDateInput, opts?: UtcFormatOptions): string {
  return format(value, opts, DATE_DEFAULTS, false);
}

/** Time-of-day in UTC, e.g. "14:05 UTC". */
export function formatUtcTime(value: UtcDateInput, opts?: UtcFormatOptions): string {
  return format(value, opts, TIME_DEFAULTS, true);
}

/** Epoch ms of 00:00 UTC of the day containing `value` (default: now). */
export function startOfUtcDay(value: UtcDateInput = new Date()): number {
  const d = toValidDate(value) ?? new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Returns a Date at 00:00 UTC `days` days from the UTC day of `from` (negative = past). */
export function addUtcDays(days: number, from: UtcDateInput = new Date()): Date {
  return new Date(startOfUtcDay(from) + days * 86_400_000);
}

export function isSameUtcDay(a: UtcDateInput, b: UtcDateInput): boolean {
  const da = toValidDate(a);
  const db = toValidDate(b);
  if (!da || !db) return false;
  return startOfUtcDay(da) === startOfUtcDay(db);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Value for <input type="datetime-local"> expressed in UTC: "YYYY-MM-DDTHH:mm".
 * Returns '' for empty/invalid input.
 */
export function toUtcInputValue(value: UtcDateInput): string {
  const d = toValidDate(value);
  if (!d) return '';
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/**
 * Parses a datetime-local value that the admin typed in UTC ("YYYY-MM-DDTHH:mm[:ss]")
 * into an ISO string (with Z). Returns null for empty/invalid input.
 */
export function fromUtcInputValue(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', sec = '0'] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}
