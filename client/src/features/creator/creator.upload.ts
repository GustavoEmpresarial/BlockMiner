import { api } from '../../shared/auth/auth.store';

export async function uploadChannelPhoto(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('photo', file);
  const res = await api.post<{ ok?: boolean; url?: string }>('/social/upload-photo', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.ok && res.data.url ? res.data.url : null;
}
