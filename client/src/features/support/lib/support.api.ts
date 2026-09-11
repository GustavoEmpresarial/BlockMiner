import { api } from '../../../shared/auth/auth.store';

export function listSupportTickets(params: { page: number; limit: number }) {
  return api.get('/support', { params });
}

export function getSupportTicket(id: number | string) {
  return api.get(`/support/${id}`);
}

export function createSupportTicket(body: {
  subject: string;
  message: string;
  name?: string;
  email?: string;
  attachments?: { url: string; mimeType?: string }[];
}) {
  return api.post('/support', body);
}

export function replySupportTicket(
  id: number | string,
  body: { message: string; attachments?: { url: string; mimeType?: string }[] },
) {
  return api.post(`/support/${id}/reply`, body);
}

export function uploadSupportImage(formData: FormData) {
  return api.post('/support/upload-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
