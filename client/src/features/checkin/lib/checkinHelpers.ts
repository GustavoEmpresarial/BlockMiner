import type {
  CheckinCadenceDailySlice,
  CheckinMilestone,
  CheckinMilestoneRewardType,
  CheckinMilestoneState,
  CheckinPeriodInfo,
  CheckinStatusPayload,
} from './checkin.types';

/** Polygon tx hash (0x + 64 hex). */
export const POLYGON_TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** UTC / ISO day key YYYY-MM-DD. */
export const UTC_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const WEI_PER_POL = 10n ** 18n;

export function weiHexFromDecimalString(weiStr: string): string {
  try {
    const v = BigInt(weiStr);
    return `0x${v.toString(16)}`;
  } catch {
    return '0x0';
  }
}

export function formatPolFromWei(weiStr: string): string {
  try {
    const n = Number(BigInt(weiStr)) / Number(WEI_PER_POL);
    if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, '');
    return n.toFixed(6).replace(/\.?0+$/, '');
  } catch {
    return '?';
  }
}

export function mergeStatus(
  prev: CheckinStatusPayload | null,
  incoming: CheckinStatusPayload | null,
): CheckinStatusPayload | null {
  if (!incoming) return prev;
  return { ...(prev || {}), ...incoming };
}

export function getDailySlice(status: CheckinStatusPayload | null): CheckinCadenceDailySlice {
  const from = status?.cadenceStatus?.daily;
  if (from) return from;
  return {
    periodKey: '',
    checkedIn: Boolean(status?.checkedIn),
    pending: Boolean(status?.pending),
    failed: Boolean(status?.failed),
    status: status?.status ?? null,
    txHash: status?.txHash ?? null,
  };
}

export function cadenceSliceNeedsPoll(cs: CheckinCadenceDailySlice | null | undefined): boolean {
  return Boolean(cs?.pending || (cs?.txHash && !cs?.checkedIn && !cs?.failed));
}

export function statusNeedsCheckinPoll(s: CheckinStatusPayload | null | undefined): boolean {
  if (!s?.paymentRequired || !s) return false;
  if (s.cadenceStatus) {
    return cadenceSliceNeedsPoll(getDailySlice(s));
  }
  return Boolean(s.pending || (s.txHash && !s.checkedIn && !s.failed));
}

export function buildPolygonscanTxUrl(txHash: string | null | undefined): string | null {
  if (!txHash || typeof txHash !== 'string') return null;
  const t = txHash.trim();
  if (!POLYGON_TX_HASH_RE.test(t)) return null;
  return `https://polygonscan.com/tx/${encodeURIComponent(t)}`;
}

export function sanitizeCheckinUiText(input: unknown, maxLen: number): string {
  if (input == null) return '';
  return String(input)
    .replace(/[\u0000-\u001F<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function isValidHistoryDateKey(date: string): boolean {
  return typeof date === 'string' && UTC_DATE_KEY_RE.test(date.trim());
}

export function polNumberToWeiFloor(pol: number): bigint {
  if (!Number.isFinite(pol) || pol <= 0) return 0n;
  const s = pol.toFixed(18);
  const [whole, frac = ''] = s.split('.');
  const intPart = whole.replace(/^0+(?=\d)/, '') || '0';
  const frac18 = (frac + '0'.repeat(18)).slice(0, 18);
  try {
    return BigInt(intPart) * WEI_PER_POL + BigInt(frac18);
  } catch {
    return 0n;
  }
}

export function balanceCoversWeiCost(polBalance: number, costWeiStr: string): boolean {
  try {
    const cost = BigInt(costWeiStr);
    if (cost <= 0n) return true;
    const balWei = polNumberToWeiFloor(polBalance);
    return balWei + 1n >= cost;
  } catch {
    return false;
  }
}

type CheckinT = (key: string, opts?: Record<string, unknown>) => string;

function formatPeriodInstant(iso: string, timezone?: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      timeZone: timezone || undefined,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function formatCheckinPeriodRange(t: CheckinT, period: CheckinPeriodInfo | null | undefined): string {
  if (!period?.startsAt || !period.endsAt) return '—';
  const start = formatPeriodInstant(period.startsAt, period.timezone);
  const end = formatPeriodInstant(period.endsAt, period.timezone);
  return t('checkin.period.range', { start, end, defaultValue: '{{start}} – {{end}}' });
}

export function formatCheckinNextReset(t: CheckinT, period: CheckinPeriodInfo | null | undefined): string {
  if (!period?.nextResetAt) return '—';
  const time = formatPeriodInstant(period.nextResetAt, period.timezone);
  return t('checkin.period.next_reset_at', {
    time,
    hour: period.resetHour,
    defaultValue: 'Next reset: {{time}}',
  });
}

export function formatCheckinAvailableUntil(t: CheckinT, period: CheckinPeriodInfo | null | undefined): string {
  if (!period?.endsAt) return '—';
  const time = formatPeriodInstant(period.endsAt, period.timezone);
  return t('checkin.period.available_until', { time, defaultValue: 'Available until {{time}}' });
}

export function normalizeMilestoneRewardType(raw: unknown): CheckinMilestoneRewardType {
  switch (String(raw || '').toLowerCase()) {
    case 'pol':
    case 'balance':
      return 'pol';
    case 'temporary_power':
    case 'hashrate':
      return 'temporary_power';
    case 'machine':
      return 'machine';
    case 'unavailable':
      return 'unavailable';
    case 'item':
    case 'stelar':
    case 'zer':
    case 'none':
      return 'unavailable';
    default:
      return 'unknown';
  }
}

function formatPositiveNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(n);
}

export function formatMilestoneDurationHours(t: CheckinT, durationHours: unknown): string {
  const r = Number(durationHours);
  if (!Number.isFinite(r) || r <= 0) return '';
  if (r < 24) return t('checkin.milestones.durationHours', { count: r });
  const days = Math.max(1, Math.round(r / 24));
  return t('checkin.milestones.durationDays', { count: days });
}

function milestoneI18nParams(m: CheckinMilestone, t: CheckinT): Record<string, string | number> {
  const day = m.dayThreshold;
  const amount = formatPositiveNumber(m.rewardValue ?? m.amount);
  const rewardKind = normalizeMilestoneRewardType(m.rewardType);
  const machinePower = formatPositiveNumber(
    m.minerBaseHashRate ?? (rewardKind === 'machine' ? m.powerAmount : null),
  );
  const power = formatPositiveNumber(m.powerAmount ?? m.rewardValue ?? m.amount);
  const params: Record<string, string | number> = {
    day,
    name: m.minerName || '—',
  };
  if (amount) params.amount = amount;
  if (rewardKind === 'machine' && machinePower) params.power = machinePower;
  else if (power) params.power = power;
  const duration = formatMilestoneDurationHours(t, m.durationHours);
  if (duration) params.duration = duration;
  return params;
}

function milestoneRewardI18nKey(rewardType: CheckinMilestoneRewardType): string {
  const segment = rewardType === 'temporary_power' ? 'temporaryPower' : rewardType;
  return segment;
}

export function milestoneTitle(t: CheckinT, m: CheckinMilestone): string {
  const rewardType = normalizeMilestoneRewardType(m.rewardType);
  const segment = milestoneRewardI18nKey(rewardType);
  const params = milestoneI18nParams(m, t);
  if (
    rewardType === 'machine' &&
    formatPositiveNumber(m.minerBaseHashRate ?? m.powerAmount)
  ) {
    return String(t(`checkin.milestones.reward.${segment}.titleWithPower`, params));
  }
  return String(t(`checkin.milestones.reward.${segment}.title`, params));
}

export function milestoneDescription(t: CheckinT, m: CheckinMilestone): string {
  const rewardType = normalizeMilestoneRewardType(m.rewardType);
  const segment = milestoneRewardI18nKey(rewardType);
  return String(t(`checkin.milestones.reward.${segment}.description`, milestoneI18nParams(m, t)));
}

export function milestoneRewardLine(t: CheckinT, m: CheckinMilestone): string {
  const rewardType = normalizeMilestoneRewardType(m.rewardType);
  if (rewardType === 'unavailable' || rewardType === 'unknown') return '';
  const amount = formatPositiveNumber(m.rewardValue ?? m.amount);
  if (rewardType === 'pol' && amount) {
    return String(t('checkin.milestone_reward_pol', { value: amount }));
  }
  if (rewardType === 'temporary_power' && amount) {
    const duration = formatMilestoneDurationHours(t, m.durationHours) || '—';
    return String(t('checkin.milestones.reward.temporaryPower.line', { power: amount, duration }));
  }
  if (rewardType === 'machine') {
    const power = formatPositiveNumber(m.minerBaseHashRate ?? m.powerAmount);
    if (power) {
      return String(t('checkin.milestones.reward.machine.line', { power, name: m.minerName ?? '' }));
    }
  }
  return '';
}

export function milestoneStatusLabel(t: CheckinT, state: CheckinMilestoneState | string): string {
  if (state === 'unavailable') return String(t('checkin.milestones.status.unavailable'));
  switch (state) {
    case 'claimed':
      return String(t('checkin.milestones.status.claimed'));
    case 'eligible':
      return String(t('checkin.milestones.status.unlockedNextCheckin'));
    default:
      return String(t('checkin.milestones.status.blocked'));
  }
}

export function milestoneDayLabel(t: CheckinT, dayThreshold: number): string {
  return String(t('checkin.milestones.days', { count: dayThreshold }));
}

export function resolveMilestoneState(m: CheckinMilestone): CheckinMilestoneState {
  const raw = m.state || m.status || 'locked';
  if (raw === 'claimed' || raw === 'eligible' || raw === 'unavailable') return raw;
  return 'locked';
}

export function sortMilestones(milestones: CheckinMilestone[] | undefined): CheckinMilestone[] {
  return [...(milestones ?? [])].sort(
    (a, b) => (Number(a.dayThreshold) || 0) - (Number(b.dayThreshold) || 0),
  );
}
