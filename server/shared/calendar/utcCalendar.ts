/**
 * Pure calendar math (no DB, no side effects) — UTC, reset always at 00:00.
 *
 * Decisão explícita do usuário: o site inteiro usa UTC 00:00 como corte de dia,
 * abandonando de propósito o fuso America/Sao_Paulo (21h) que o legacy usava
 * pra checkin/energy-tax/faucet/game2048. Não é stub nem gap — é escolha de
 * produto, divergindo do legacy conscientemente. Alinha com o que boosts/ e
 * auto-mining/ (Fase 3) já faziam com `todayKeyUTC()`.
 *
 * Vive em shared/ pelo mesmo motivo de antes: múltiplos módulos independentes
 * (checkin/, energy-tax/, faucet/, games/) precisam do mesmo cálculo de "dia
 * UTC atual" — é o caso real de "genuinamente cross-domain" que justifica
 * shared/ na doutrina.
 */

function pad2(value: string | number): string {
  return String(value).padStart(2, "0");
}

function buildDayKey(year: string | number, month: string | number, day: string | number): string {
  return `${String(year)}-${pad2(month)}-${pad2(day)}`;
}

/** Current UTC calendar day as YYYY-MM-DD. */
export function getUtcDayKey(date: Date = new Date()): string {
  return buildDayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * ISO week key in UTC (e.g. 2026-W15) — Monday-based week numbering.
 * Used by mini-pass weekly mission period buckets.
 */
export function getUtcIsoWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Legacy deployments have produced more than one textual shape for the same day.
 * Normalize them to a single YYYY-MM-DD key before comparing streaks or loading today's row.
 */
export function normalizeUtcDayKey(input: unknown): string {
  if (input instanceof Date) return getUtcDayKey(input);
  if (typeof input !== "string") return "";
  const raw = input.trim();
  if (!raw) return "";

  const ymdDash = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (ymdDash) return buildDayKey(ymdDash[1], ymdDash[2], ymdDash[3]);

  const ymdSlash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[T\s].*)?$/);
  if (ymdSlash) return buildDayKey(ymdSlash[1], ymdSlash[2], ymdSlash[3]);

  const mdySlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s].*)?$/);
  if (mdySlash) return buildDayKey(mdySlash[3], mdySlash[1], mdySlash[2]);

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return getUtcDayKey(parsed);

  return "";
}

/** Textual aliases that have appeared for the same day (legacy data-shape drift). */
export function getUtcDayKeyAliases(input: Date | string = new Date()): string[] {
  const normalized = normalizeUtcDayKey(input);
  if (!normalized) return [];
  const [year, month, day] = normalized.split("-");
  const m = String(Number(month));
  const d = String(Number(day));
  return Array.from(
    new Set([
      normalized,
      `${year}-${m}-${d}`,
      `${year}/${month}/${day}`,
      `${year}/${m}/${d}`,
      `${month}/${day}/${year}`,
      `${m}/${d}/${year}`,
    ]),
  );
}

/** UTC calendar day, offset by whole days (streak math). */
export function addDaysToUtcDayKey(dateKey: string, deltaDays: number): string {
  const normalized = normalizeUtcDayKey(dateKey);
  if (!normalized) throw new Error(`Invalid UTC date key: ${String(dateKey)}`);
  const [Y, M, D] = normalized.split("-").map(Number);
  const shifted = new Date(Date.UTC(Y, M - 1, D + deltaDays, 0, 0, 0));
  return getUtcDayKey(shifted);
}

/** First day of calendar month in UTC (YYYY-MM). */
export function getUtcMonthPeriodKey(date: Date = new Date()): string {
  return getUtcDayKey(date).slice(0, 7);
}

export function isSameUtcDay(storedKey: string, currentKey: string): boolean {
  const stored = normalizeUtcDayKey(storedKey);
  const current = normalizeUtcDayKey(currentKey);
  if (!stored || !current) return false;
  return stored === current;
}

/** DB lookup keys for a day key (current + legacy textual aliases). */
export function getUtcDayKeyLookupKeys(dayKey: string): string[] {
  const normalized = normalizeUtcDayKey(dayKey);
  if (!normalized) return [];
  return [...new Set(getUtcDayKeyAliases(normalized))];
}

/** Instant when this UTC day ends and the next one begins (next UTC midnight). */
export function getUtcPeriodResetAt(dayKey: string): Date {
  const normalized = normalizeUtcDayKey(dayKey);
  if (!normalized) throw new Error(`Invalid UTC date key: ${dayKey}`);
  const [y, m, d] = normalized.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
}

/** Start instant of this UTC day (the UTC midnight it begins at). */
export function getUtcPeriodStartAt(dayKey: string): Date {
  const normalized = normalizeUtcDayKey(dayKey);
  if (!normalized) throw new Error(`Invalid UTC date key: ${dayKey}`);
  const [y, m, d] = normalized.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}
