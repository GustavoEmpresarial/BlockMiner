import { api } from '../../../shared/auth/auth.store';
import type { PartsOverviewResponse } from './parts.types';

export function getPartsOverview() {
  return api.get<PartsOverviewResponse>('/parts');
}
