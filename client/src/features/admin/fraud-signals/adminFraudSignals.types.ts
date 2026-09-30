/**
 * Typed contracts and DTOs for Admin Fraud Signals (/admin/fraud-signals).
 */

export type FraudScope = 'all' | 'wallets' | 'ips' | 'devices';

export type FraudClusterUser = {
  id: number;
  username: string | null;
  email: string;
  walletAddress: string | null;
  createdAt: string | Date;
  lastLoginAt: string | Date | null;
};

export type MultiAccountRiskDecision = {
  confidence: 'Low' | 'Medium' | 'High';
  recommendedAction: string;
  destructiveAllowed: boolean;
  reason: string;
  requiresManualReview: boolean;
  anomalies?: string[];
};

export type FraudCluster = {
  id: string;
  kind: string;
  signalType: string;
  key: string;
  userCount: number;
  users: FraudClusterUser[];
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
  falsePositiveWarnings: string[];
  identityVectors: string[];
  decision: MultiAccountRiskDecision;
};

export type FraudSignalsResponse = {
  ok: boolean;
  scope: FraudScope;
  page: number;
  limit: number;
  total: number;
  signalCount: number;
  signals: FraudCluster[];
  generatedAt: string;
  note: string;
};

export type RefreshIpResponse = {
  ok: boolean;
  ip: string;
  intelligence: {
    ip: string;
    normalizedIp: string;
    reverseDns: string | null;
    reverseDnsForwardConfirmed: boolean | null;
    asn: number | null;
    asnOrg: string | null;
    networkCidr: string | null;
    providerLabel: string | null;
    providerType: string | null;
    confidence: string | null;
    proxyDetected: boolean | null;
    proxyType: string | null;
    proxyRiskScore: number | null;
    checkedAt: string | Date;
  } | null;
};

export type ResetCollectionResponse = {
  ok: boolean;
  message: string;
  ipLogsDeleted: number;
  ipIntelDeleted: number;
  usersProfileAntiFraudCleared: number;
};
