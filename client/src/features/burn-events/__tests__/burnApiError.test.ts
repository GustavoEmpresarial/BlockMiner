import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { resolveBurnApiError } from '../lib/burnApiError';

function t(key: string) {
  if (key === 'burnEvents.errors.CLAIM_LIMIT_REACHED') return 'Limite de queimas atingido.';
  return key;
}

describe('resolveBurnApiError', () => {
  it('maps a known burn error code through i18n', () => {
    const err = new AxiosError('Request failed');
    err.response = {
      data: { ok: false, code: 'CLAIM_LIMIT_REACHED', message: 'raw' },
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: { headers: {} },
    };
    expect(resolveBurnApiError(err, t, 'fallback')).toBe('Limite de queimas atingido.');
  });

  it('falls back when the code has no translation', () => {
    const err = new AxiosError('Request failed');
    err.response = {
      data: { ok: false, code: 'UNKNOWN_CODE', message: 'Server says no.' },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: { headers: {} },
    };
    expect(resolveBurnApiError(err, t, 'fallback')).toBe('Server says no.');
  });
});
