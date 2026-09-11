import type { TFunction } from 'i18next';

export const KIND_PTC = 'PTC_IFRAME';
export const KIND_GEN = 'GENERAL_TASK';

export type InternalOfferwallFormState = {
  kind: string;
  title: string;
  description: string;
  iframeUrl: string;
  minViewSeconds: string;
  maxExecutionsPerPeriod: string;
  resetType: string;
  cooldownSeconds: string;
  rewardKind: string;
  rewardBlkAmount: string;
  rewardPolAmount: string;
  rewardHashRate: string;
  rewardHashRateDays: string;
  completionMode: string;
  sortOrder: string;
  isActive: boolean;
  requiredActionsText: string;
  targetCountryCodes: string;
  externalInfoUrl: string;
  verificationNote: string;
};

export type TaskMetadataShape = {
  requiredActions?: unknown;
  targetCountryCodes?: unknown;
  resetType?: unknown;
  externalInfoUrl?: unknown;
  verificationNote?: unknown;
  cooldownSeconds?: unknown;
};

export type InternalOfferwallOfferRow = {
  id: number;
  kind?: string | null;
  title?: string | null;
  description?: string | null;
  iframeUrl?: string | null;
  minViewSeconds?: number | string | null;
  dailyLimitPerUser?: number | string | null;
  rewardKind?: string | null;
  rewardBlkAmount?: number | string | null;
  rewardPolAmount?: number | string | null;
  rewardHashRate?: number | string | null;
  rewardHashRateDays?: number | string | null;
  completionMode?: string | null;
  sortOrder?: number | string | null;
  isActive?: boolean | null;
  taskMetadata?: TaskMetadataShape | null;
};

export type InternalOfferwallAttemptRow = {
  id: number;
  userId: number;
  offer?: { title?: string | null } | null;
  user?: { username?: string | null; email?: string | null } | null;
};

export type InternalOfferwallSaveBody = {
  kind: string;
  title: string;
  description: string | null;
  minViewSeconds: number;
  maxExecutionsPerPeriod: number;
  resetType: string;
  rewardKind: string;
  completionMode: string;
  sortOrder: number;
  isActive: boolean;
  cooldownSeconds?: number;
  iframeUrl?: string;
  rewardBlkAmount?: number;
  rewardPolAmount?: number;
  rewardHashRate?: number;
  rewardHashRateDays?: number;
  taskMetadata: Record<string, unknown> | null;
};

export type InternalOfferwallApiErr = {
  message?: string;
  code?: string;
  details?: { host?: string };
};

export type OfferPreset = {
  id: string;
  label: string;
  hint: string;
  apply: (form: InternalOfferwallFormState) => InternalOfferwallFormState;
};

export function defaultForm(): InternalOfferwallFormState {
  return {
    kind: KIND_PTC,
    title: '',
    description: '',
    iframeUrl: '',
    minViewSeconds: '10',
    maxExecutionsPerPeriod: '3',
    resetType: 'DAILY',
    cooldownSeconds: '3600',
    rewardKind: 'BLK',
    rewardBlkAmount: '0.01',
    rewardPolAmount: '0.01',
    rewardHashRate: '5',
    rewardHashRateDays: '1',
    completionMode: 'USER_SELF_CLAIM',
    sortOrder: '0',
    isActive: true,
    requiredActionsText: '',
    targetCountryCodes: '',
    externalInfoUrl: '',
    verificationNote: ''
  };
}

export const OFFER_PRESETS: OfferPreset[] = [
  {
    id: 'ptc-fast',
    label: 'PTC rápido',
    hint: 'Iframe curto com reset diário',
    apply(form) {
      return {
        ...form,
        kind: KIND_PTC,
        minViewSeconds: '10',
        maxExecutionsPerPeriod: '3',
        resetType: 'DAILY',
        cooldownSeconds: '3600',
        rewardKind: 'BLK',
        rewardBlkAmount: '0.01',
        completionMode: 'USER_SELF_CLAIM',
      };
    }
  },
  {
    id: 'ptc-premium',
    label: 'PTC premium',
    hint: 'Mais tempo e recompensa maior',
    apply(form) {
      return {
        ...form,
        kind: KIND_PTC,
        minViewSeconds: '25',
        maxExecutionsPerPeriod: '2',
        resetType: 'COOLDOWN',
        cooldownSeconds: '21600',
        rewardKind: 'POL',
        rewardPolAmount: '0.02',
        completionMode: 'ADMIN_APPROVAL',
      };
    }
  },
  {
    id: 'task-manual',
    label: 'Tarefa manual',
    hint: 'Sem iframe, com análise do admin',
    apply(form) {
      return {
        ...form,
        kind: KIND_GEN,
        minViewSeconds: '0',
        maxExecutionsPerPeriod: '1',
        resetType: 'COOLDOWN',
        cooldownSeconds: '86400',
        rewardKind: 'HASHRATE_TEMP',
        rewardHashRate: '8',
        rewardHashRateDays: '2',
        completionMode: 'ADMIN_APPROVAL',
      };
    }
  },
];

export function rowToForm(row: InternalOfferwallOfferRow): InternalOfferwallFormState {
  const meta: TaskMetadataShape =
    row.taskMetadata && typeof row.taskMetadata === 'object' ? row.taskMetadata : {};
  const actions = Array.isArray(meta.requiredActions)
    ? meta.requiredActions.map((a) => String(a)).join('\n')
    : '';
  const countries = Array.isArray(meta.targetCountryCodes)
    ? meta.targetCountryCodes.map((c) => String(c)).join(', ')
    : '';
  const resetType = String(meta.resetType || 'DAILY').toUpperCase() === 'COOLDOWN' ? 'COOLDOWN' : 'DAILY';
  return {
    kind: String(row.kind || KIND_PTC),
    title: String(row.title || ''),
    description: row.description != null ? String(row.description) : '',
    iframeUrl: String(row.iframeUrl || ''),
    minViewSeconds: String(row.minViewSeconds ?? 10),
    maxExecutionsPerPeriod: String(row.dailyLimitPerUser ?? 3),
    resetType,
    cooldownSeconds: String(meta.cooldownSeconds ?? 3600),
    rewardKind: String(row.rewardKind || 'BLK'),
    rewardBlkAmount: row.rewardBlkAmount != null ? String(row.rewardBlkAmount) : '0.01',
    rewardPolAmount: row.rewardPolAmount != null ? String(row.rewardPolAmount) : '0.01',
    rewardHashRate: String(row.rewardHashRate ?? 5),
    rewardHashRateDays: String(row.rewardHashRateDays ?? 1),
    completionMode: String(row.completionMode || 'USER_SELF_CLAIM'),
    sortOrder: String(row.sortOrder ?? 0),
    isActive: Boolean(row.isActive),
    requiredActionsText: actions,
    targetCountryCodes: countries,
    externalInfoUrl: meta.externalInfoUrl != null ? String(meta.externalInfoUrl) : '',
    verificationNote: meta.verificationNote != null ? String(meta.verificationNote) : ''
  };
}

export function buildApiBody(form: InternalOfferwallFormState): InternalOfferwallSaveBody {
  const resetType = String(form.resetType || 'DAILY').toUpperCase();
  const body: InternalOfferwallSaveBody = {
    kind: form.kind,
    title: form.title.trim(),
    description: form.description.trim() || null,
    minViewSeconds: parseInt(String(form.minViewSeconds), 10),
    maxExecutionsPerPeriod: parseInt(String(form.maxExecutionsPerPeriod), 10),
    resetType,
    rewardKind: form.rewardKind,
    completionMode: form.completionMode,
    sortOrder: parseInt(String(form.sortOrder), 10) || 0,
    isActive: form.isActive,
    taskMetadata: null,
  };
  if (body.resetType === 'COOLDOWN') {
    body.cooldownSeconds = parseInt(String(form.cooldownSeconds), 10);
  }
  if (form.kind === KIND_PTC) {
    body.iframeUrl = form.iframeUrl.trim();
  }
  if (form.rewardKind === 'BLK') {
    body.rewardBlkAmount = parseFloat(String(form.rewardBlkAmount).replace(',', '.'));
  }
  if (form.rewardKind === 'POL') {
    body.rewardPolAmount = parseFloat(String(form.rewardPolAmount).replace(',', '.'));
  }
  if (form.rewardKind === 'HASHRATE_TEMP') {
    body.rewardHashRate = parseFloat(String(form.rewardHashRate).replace(',', '.'));
    body.rewardHashRateDays = parseInt(String(form.rewardHashRateDays), 10);
  }

  const meta: Record<string, unknown> = {};
  const lines = String(form.requiredActionsText || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length) meta.requiredActions = lines;
  const cc = String(form.targetCountryCodes || '')
    .trim()
    .split(/[\s,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (cc.length) meta.targetCountryCodes = cc;
  if (form.kind === KIND_GEN) {
    const ext = String(form.externalInfoUrl || '').trim();
    if (ext && ext !== 'https://' && ext !== 'http://') meta.externalInfoUrl = ext;
  }
  const vn = String(form.verificationNote || '').trim();
  if (vn) meta.verificationNote = vn;
  body.taskMetadata = Object.keys(meta).length ? meta : null;

  return body;
}

export function rewardSummary(row: InternalOfferwallOfferRow): string {
  const k = String(row.rewardKind || '').toUpperCase();
  if (k === 'BLK' && row.rewardBlkAmount != null) return `BLK ${row.rewardBlkAmount}`;
  if (k === 'POL' && row.rewardPolAmount != null) return `POL ${row.rewardPolAmount}`;
  if (k === 'HASHRATE_TEMP') return `HR ${row.rewardHashRate} / ${row.rewardHashRateDays}d`;
  return k;
}

export function currentRewardSummary(form: InternalOfferwallFormState): string {
  if (form.rewardKind === 'BLK') return `${form.rewardBlkAmount || '0'} BLK`;
  if (form.rewardKind === 'POL') return `${form.rewardPolAmount || '0'} POL`;
  if (form.rewardKind === 'HASHRATE_TEMP') return `${form.rewardHashRate || '0'} H/s por ${form.rewardHashRateDays || '0'} dia(s)`;
  return form.rewardKind;
}

export function formatInternalOfferwallApiError(t: TFunction, data: InternalOfferwallApiErr | undefined): string {
  if (data?.code === 'IFRAME_HOST_INVALID') {
    return t('admin_internal_offerwall.error_iframe_host_invalid');
  }
  if (data?.code === 'IFRAME_URL_NOT_ALLOWED' && data.details?.host) {
    return t('admin_internal_offerwall.error_iframe_not_allowed', { host: data.details.host });
  }
  return data?.message || t('admin_internal_offerwall.load_error');
}

export function readAxiosApiErr(err: unknown): InternalOfferwallApiErr | undefined {
  if (typeof err !== 'object' || err === null || !('response' in err)) return undefined;
  const response = (err as { response?: { data?: unknown } }).response;
  if (typeof response !== 'object' || response === null) return undefined;
  const raw = response.data;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const out: InternalOfferwallApiErr = {};
  if (typeof o.message === 'string') out.message = o.message;
  if (typeof o.code === 'string') out.code = o.code;
  if (typeof o.details === 'object' && o.details !== null && 'host' in o.details) {
    const host = (o.details as { host?: unknown }).host;
    if (typeof host === 'string') out.details = { host };
  }
  return Object.keys(out).length ? out : undefined;
}

export type OffersListResponse = { ok: boolean; offers?: InternalOfferwallOfferRow[] };
export type AttemptsListResponse = { ok: boolean; attempts?: InternalOfferwallAttemptRow[] };
export type SaveMutationResponse = { ok: boolean } & Partial<InternalOfferwallApiErr>;
