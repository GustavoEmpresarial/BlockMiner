import { api } from '../../shared/auth/auth.store';

export type ContractStatus = {
  version: string;
  clauses: string[];
  signed: boolean;
  signedAt: string | null;
  certificate: string | null;
};

export async function fetchContractStatus(): Promise<ContractStatus> {
  const res = await api.get<{ ok: boolean } & ContractStatus>('/terms/contract');
  if (!res.data || !Array.isArray(res.data.clauses)) throw new Error('TERMS_STATUS_INVALID');
  return res.data;
}

export async function signContract(version: string, stamped: string[]): Promise<ContractStatus> {
  const res = await api.post<{ ok: boolean } & ContractStatus>('/terms/contract/sign', { version, stamped });
  return res.data;
}
