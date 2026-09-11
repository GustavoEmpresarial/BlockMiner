/**
 * Re-export fino de shared/calendar/utcCalendar.ts.
 *
 * Isso era um arquivo de ~150 linhas duplicando cálculo de calendário (o
 * próprio header antigo já dizia "quando checkin/ existir, considere apontar
 * pra lá em vez de duplicar" — checkin/ existe desde a Fase 4, e agora que
 * todo o site foi padronizado em UTC 00:00 (decisão explícita do usuário,
 * substituindo o fuso America/Sao_Paulo do legacy), o cálculo é literalmente
 * o mesmo dos outros três módulos que usam calendário — zero razão pra manter
 * uma segunda cópia.
 */
export { getUtcDayKey, normalizeUtcDayKey, getUtcDayKeyAliases, addDaysToUtcDayKey, getUtcDayKeyLookupKeys, getUtcPeriodStartAt } from "../../shared/calendar/utcCalendar.js";
