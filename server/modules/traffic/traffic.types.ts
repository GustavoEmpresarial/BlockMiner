import type { ClientErrorBody, HitBody } from "./traffic.schemas.js";

export type { ClientErrorBody, HitBody };

export type RecordPageViewInput = HitBody;

export type TrafficSummary = {
  totalHits: number;
  periodHits: number;
  totalRegs: number;
  periodRegs: number;
  conversionRate: number;
  days: number;
};

export type TrafficByDomainRow = {
  domain: string;
  hits: number;
  registrations: number;
  conversionRate: number;
};

export type TrafficByUtmRow = {
  source: string;
  hits: number;
  registrations: number;
  conversionRate: number;
};

export type TrafficDailyRow = {
  date: string;
  hits: number;
  registrations: number;
};

export type ClientErrorReportInput = ClientErrorBody & {
  userAgent: string | null;
  ip: string;
  userId: number | null;
};

export type ClientErrorListItem = {
  id: number;
  action: string;
  severity: string;
  label: string | null;
  description: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: Date;
  userId: number | null;
  user: { id: number; name: string } | null;
};
