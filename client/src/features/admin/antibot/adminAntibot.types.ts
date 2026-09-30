/**
 * Typed contracts and DTOs for Admin AntiBot (/admin/antibot).
 */

export type RiskBand = 'trusted' | 'low' | 'suspicious' | 'high' | 'critical';

export type Tab = 'overview' | 'evidence' | 'sessions' | 'devices' | 'alerts';

export type TopRiskRow = {
  userId: number;
  riskScore: number;
  trustScore: number;
  peakRiskScore: number;
  evidenceCount: number;
  lastEventAt: string | null;
  updatedAt: string;
  user: { id: number; username: string | null; email: string; isBanned: boolean };
};

export type AlertRow = {
  id: number;
  type: string;
  severity: string;
  status: string;
  riskScore: number;
  message: string | null;
  createdAt: string;
  user: { id: number; username: string | null; email: string } | null;
};

export type OverviewData = {
  ok: boolean;
  topRisk: TopRiskRow[];
  openAlerts: number;
  recentAlerts: AlertRow[];
  totals: { profiles: number; maxRisk: number; avgRisk: number };
};

export type EvidenceRow = {
  id: number;
  userId: number;
  sessionId: string | null;
  eventType: string;
  detector: string;
  code: string;
  reason: string;
  weight: number;
  scoreBefore: number;
  scoreAfter: number;
  severity: string;
  ip: string | null;
  deviceId: string | null;
  fingerprint: string | null;
  createdAt: string;
};

export type SessionRow = {
  id: number;
  userId: number;
  sessionId: string;
  ip: string | null;
  browser: string | null;
  os: string | null;
  platform: string | null;
  country?: string | null;
  asn?: string | null;
  deviceId: string | null;
  fingerprint: string | null;
  language?: string | null;
  timezone?: string | null;
  createdAt: string;
  lastSeenAt: string;
};

export type DeviceRow = {
  deviceId: string;
  fingerprint: string | null;
  canvasHash?: string | null;
  webglVendor?: string | null;
  webglRenderer?: string | null;
  platform: string | null;
  accountCount: number;
  firstSeenAt?: string;
  lastSeenAt: string;
};

export type PagedResource<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  q: string;
  setPage: (page: number) => void;
  setQ: (value: string) => void;
  reload: () => Promise<void>;
};

export type AdminAntibotUserProfile = {
  ok: boolean;
  user: {
    id: number;
    username: string | null;
    email: string;
    isBanned: boolean;
    createdAt: string;
    lastLoginAt?: string | null;
  };
  profile: {
    userId: number;
    riskScore: number;
    trustScore: number;
    peakRiskScore: number;
    evidenceCount: number;
    trusted: boolean;
    trustedReason: string | null;
    lastEventAt: string | null;
    lastComputedAt: string;
    updatedAt: string;
    band: RiskBand;
  };
  evidence: EvidenceRow[];
  sessions: SessionRow[];
  devices: DeviceRow[];
};

export type AdminAntibotResetResponse = {
  ok: boolean;
  evidenceDeleted?: number;
};

export type AdminAntibotTrustInput = {
  trusted?: boolean;
  reason?: string | null;
};

export type AdminAntibotTrustResponse = {
  ok: boolean;
  userId: number;
  trusted: boolean;
};

export type AdminAntibotRecomputeResponse = {
  ok: boolean;
  userId: number;
  score: number;
  band: RiskBand;
};

export type AdminAntibotUpdateAlertResponse = {
  ok: boolean;
  alert: AlertRow;
};
