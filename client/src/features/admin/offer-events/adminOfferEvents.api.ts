import { api } from '../../../shared/auth/auth.store';
import type {
  AdminOfferEventGetResponse,
  AdminOfferEventListRow,
  AdminOfferEventMinersListResponse,
  AdminOfferEventMutationResponse,
  AdminOfferEventPurchasesListResponse,
} from '../lib/admin.types';

/** Mount path under `/api` — same as `offerEventsAdminRouter`. */
export const ADMIN_OFFER_EVENTS_PATH = '/admin/offer-events';

/**
 * Sales tab. Matches `ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE_MAX` on the server
 * (`listPurchasesQuerySchema` rejects anything above 200).
 */
export const ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE = 200;

/**
 * Admin grid has no pager. Must equal `ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX`
 * or the list silently truncates at the server default of 20.
 */
export const ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE = 100;

export type AdminOfferEventsListResponse = {
  ok?: boolean;
  page?: number;
  pageSize?: number;
  total?: number;
  events?: AdminOfferEventListRow[];
};

export type AdminOfferEventWriteBody = {
  title: string;
  description: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

export type AdminOfferEventMinerWriteBody = {
  name: string;
  description: string;
  imageUrl: string | null;
  price: number;
  hashRate: number;
  currency: string;
  stockUnlimited: boolean;
  stockCount: number | null;
  slotSize: number;
  isActive: boolean;
  isFree: boolean;
  claimLimitPerUser: number;
};

export function listAdminOfferEvents() {
  return api.get<AdminOfferEventsListResponse>(ADMIN_OFFER_EVENTS_PATH, {
    params: { pageSize: ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE },
  });
}

export function getAdminOfferEvent(id: number | string) {
  return api.get<AdminOfferEventGetResponse>(`${ADMIN_OFFER_EVENTS_PATH}/${id}`);
}

export function createAdminOfferEvent(body: AdminOfferEventWriteBody) {
  return api.post<AdminOfferEventMutationResponse>(ADMIN_OFFER_EVENTS_PATH, body);
}

export function updateAdminOfferEvent(id: number | string, body: Partial<AdminOfferEventWriteBody>) {
  return api.put<AdminOfferEventMutationResponse>(`${ADMIN_OFFER_EVENTS_PATH}/${id}`, body);
}

export function deleteAdminOfferEvent(id: number | string) {
  return api.delete(`${ADMIN_OFFER_EVENTS_PATH}/${id}`);
}

export function listAdminOfferEventMiners(eventId: number | string) {
  return api.get<AdminOfferEventMinersListResponse>(`${ADMIN_OFFER_EVENTS_PATH}/${eventId}/miners`);
}

export function createAdminOfferEventMiner(eventId: number | string, body: AdminOfferEventMinerWriteBody) {
  return api.post(`${ADMIN_OFFER_EVENTS_PATH}/${eventId}/miners`, body);
}

export function updateAdminOfferEventMiner(
  eventId: number | string,
  minerId: number,
  body: AdminOfferEventMinerWriteBody,
) {
  return api.put(`${ADMIN_OFFER_EVENTS_PATH}/${eventId}/miners/${minerId}`, body);
}

export function deleteAdminOfferEventMiner(eventId: number | string, minerId: number) {
  return api.delete(`${ADMIN_OFFER_EVENTS_PATH}/${eventId}/miners/${minerId}`);
}

export function listAdminOfferEventPurchases(
  eventId: number | string,
  params?: { pageSize?: number; userId?: number },
) {
  return api.get<AdminOfferEventPurchasesListResponse>(`${ADMIN_OFFER_EVENTS_PATH}/${eventId}/purchases`, {
    params: {
      pageSize: params?.pageSize ?? ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE,
      ...(params?.userId != null ? { userId: params.userId } : {}),
    },
  });
}
