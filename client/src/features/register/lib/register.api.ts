import type { AxiosResponse } from 'axios';
import { api } from '../../../shared/auth/auth.store';
import { API_TIMEOUT_MS_AUTH } from '../../../shared/utils/apiTimeout';
import type { RegisterPayload } from '../../../shared/auth/auth.store';

export async function postAuthRegister(body: RegisterPayload): Promise<AxiosResponse<unknown>> {
  return api.post('/auth/register', body, { timeout: API_TIMEOUT_MS_AUTH });
}
