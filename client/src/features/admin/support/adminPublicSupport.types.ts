export type AdminPublicSupportStatusFilter = 'all' | 'open' | 'closed';

export interface AdminPublicSupportMessage {
  id: number;
  authorType: 'guest' | 'admin' | string;
  content: string;
  imageUrl?: string | null;
  createdAt: string;
}

export interface AdminPublicSupportTicket {
  id: number;
  guestName: string;
  guestEmail: string;
  subject: string;
  status: 'open' | 'closed' | string;
  createdAt: string;
  updatedAt: string;
  messages?: AdminPublicSupportMessage[];
}

export interface AdminPublicSupportTicketsResponse {
  ok: boolean;
  tickets: AdminPublicSupportTicket[];
  total: number;
  page?: number;
  limit?: number;
}

export interface AdminPublicSupportTicketResponse {
  ok: boolean;
  ticket: AdminPublicSupportTicket;
}

export interface AdminPublicSupportReplyInput {
  message?: string;
  imageUrl?: string | null;
}

export interface AdminPublicSupportReplyResponse {
  ok: boolean;
  message: AdminPublicSupportMessage;
}

export interface AdminPublicSupportStatusInput {
  status: 'open' | 'closed';
}

export interface AdminPublicSupportStatusResponse {
  ok: boolean;
  message?: string;
}

export interface AdminPublicSupportQuery {
  status?: AdminPublicSupportStatusFilter;
  page?: number;
  limit?: number;
}
