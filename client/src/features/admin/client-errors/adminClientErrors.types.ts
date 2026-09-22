/**
 * Ported from legacy/client/src/pages/admin/AdminClientErrors.
 *
 * Shapes the `/api/admin/client-errors` payload (AuditLog rows with
 * action in client_error_report | client_api_failure) plus the derived
 * view-model the page groups and filters on.
 */

export type ClientErrorCategory = 'crash' | 'api_failure';

export type Criticality = 'critical' | 'high' | 'warning' | 'info';

export type ClientErrorUser = { id: number; name: string };

export type ClientBreadcrumbItem = {
  ts: number;
  type: "navigation" | "click" | "xhr" | "fetch" | "console" | "custom";
  message: string;
  data?: Record<string, unknown> | null;
};

export type ClientEnvironmentInfo = {
  viewport?: string | null;
  connection?: string | null;
  language?: string | null;
  memoryMb?: number | null;
  online?: boolean | null;
};

/** `metadata` as written by traffic.service.ts's reportClientError. */
export type ClientErrorMetadata = {
  category?: string;
  statusCode?: number | null;
  code?: string | null;
  operation?: string | null;
  requestId?: string | null;
  url?: string | null;
  buildId?: string | null;
  stack?: string | null;
  componentStack?: string | null;
  fingerprint?: string | null;
  breadcrumbs?: ClientBreadcrumbItem[] | null;
  environment?: ClientEnvironmentInfo | null;
};

export type ClientErrorRow = {
  id: number;
  action: string;
  severity: string | null;
  label: string | null;
  description: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: ClientErrorMetadata | null;
  createdAt: string;
  userId: number | null;
  user: ClientErrorUser | null;
};

export type DecoratedRow = ClientErrorRow & {
  category: ClientErrorCategory;
  criticality: Criticality;
  endpoint: string;
  fingerprint: string;
};

export type ClientErrorFilters = {
  criticalities: Set<Criticality>;
  categories: Set<ClientErrorCategory>;
  search: string;
};

export type UserGroup = {
  key: string;
  user: ClientErrorUser | null;
  ip: string | null;
  rows: DecoratedRow[];
  counts: Record<Criticality, number>;
  worst: Criticality;
  lastAt: string;
};

export type ClientErrorStats = {
  total: number;
  byCriticality: Record<Criticality, number>;
  byCategory: Record<ClientErrorCategory, number>;
  affectedUsers: number;
  anonymousEvents: number;
  topEndpoints: Array<{ endpoint: string; count: number }>;
  topUsers: Array<{ user: ClientErrorUser | null; ip: string | null; count: number }>;
  firstAt: string | null;
  lastAt: string | null;
};

export type AdminClientErrorsResponse = { ok: boolean; items: ClientErrorRow[] };
export type AdminClientErrorsClearResponse = { ok: boolean; deleted: number };
