/**
 * Types and contracts for Admin Traffic Analytics.
 */

export type AdminTrafficSummary = {
  totalHits: number;
  periodHits: number;
  totalRegs: number;
  periodRegs: number;
  conversionRate: number | null;
  days: number;
  avgDailyHits?: number;
  avgDailyRegs?: number;
};

export type AdminTrafficDomainRow = {
  domain: string;
  hits: number;
  registrations: number;
  conversionRate: number | null;
};

export type AdminTrafficUtmRow = {
  source: string;
  hits: number;
  registrations: number;
  conversionRate: number | null;
};

export type AdminTrafficDailyRow = {
  date: string;
  hits: number;
  registrations: number;
  conversionRate?: number | null;
};

export type AdminTrafficTab = 'overview' | 'domains' | 'utm' | 'daily';

export type AdminTrafficDaysOption = 7 | 14 | 30 | 60 | 90 | 180 | 365;

export type AdminTrafficSortKey = 'name' | 'hits' | 'registrations' | 'conversionRate';
export type AdminTrafficSortDirection = 'asc' | 'desc';
