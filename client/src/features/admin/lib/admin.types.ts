/** Shared admin UI types (client only; server remains authoritative). */

export type AdminAuthCheckResponse = {
  ok: boolean;
};

export * from '../support/adminSupport.types';

/** Admin public-support (pre-login) ticket thread. */
export type AdminPublicSupportMessage = {
  id: number;
  authorType: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string;
};

export type AdminPublicSupportTicket = {
  id: number;
  guestName: string;
  guestEmail: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages?: AdminPublicSupportMessage[];
};

export type AdminPublicSupportTicketsResponse = {
  ok?: boolean;
  tickets: AdminPublicSupportTicket[];
  total: number;
  page?: number;
};

export type AdminPublicSupportTicketResponse = {
  ok?: boolean;
  ticket: AdminPublicSupportTicket;
};

export type AdminPublicSupportReplyResponse = {
  ok?: boolean;
  message: AdminPublicSupportMessage;
};

export type AdminPublicSupportStatusFilter = 'all' | 'open' | 'closed';

/** Legacy admin dashboard + ops types (merged from legacy admin.types.ts). */
export type AdminDashboardStats = {
  usersTotal?: number;
  usersBanned?: number;
  usersNew24h?: number;
  usersActive7d?: number;
  minersTotal?: number;
  minersActive?: number;
  minersActiveEngaged?: number;
  balanceTotal?: number;
  balanceTotalUsd?: number | null;
  balanceIncludingBanned?: number;
  balanceBanned?: number;
  polUsdPrice?: number;
  transactions24h?: number;
  serverCpuUsagePercent?: number;
  serverCpuCores?: number;
  serverMemoryUsedBytes?: number;
  serverMemoryTotalBytes?: number;
  serverMemoryUsagePercent?: number;
  serverDiskMetricsAvailable?: boolean;
  serverDiskUsedBytes?: number;
  serverDiskTotalBytes?: number;
  serverDiskUsagePercent?: number;
};

export type AdminDashboardUserRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  is_banned: boolean;
};

export type AdminDashboardWithdrawalRow = {
  id: number | string;
  userId?: number;
  amount: number | string;
  address: string;
  status: string;
  user?: { username?: string | null; email?: string | null };
};

export type AdminDashboardAuditRow = {
  id?: number | string;
  action?: string | null;
  user_email?: string | null;
  user_id?: number | null;
  ip?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
};

/** Row from GET /admin/mini-pass/seasons list. */
export type AdminMiniPassSeasonListRow = {
  id: number | string;
  slug?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  maxLevel?: number;
  xpPerLevel?: number;
  isActive?: boolean;
  _count?: { levelRewards?: number; missions?: number };
};

/** Level reward row from GET `/admin/mini-pass/seasons/:id` (`adminGetMiniPassSeason`). */
export type AdminMiniPassLevelRewardRow = {
  id: number;
  level: number;
  rewardKind: string;
  minerId?: number | null;
  eventMinerId?: number | null;
  hashRate?: string | number | null;
  hashRateDays?: string | number | null;
  blkAmount?: string | number | null;
  polAmount?: string | number | null;
  titleI18n?: { en?: string; ptBR?: string; es?: string } | null;
  miner?: { id?: number; name?: string | null; isActive?: boolean } | null;
  eventMiner?: { id?: number; name?: string | null; isActive?: boolean } | null;
};

/** Mission row from GET `/admin/mini-pass/seasons/:id`. */
export type AdminMiniPassMissionRow = {
  id: number;
  cadence: string;
  missionType: string;
  targetValue: string | number;
  xpReward: number;
  titleI18n?: { en?: string; ptBR?: string; es?: string } | null;
  descriptionI18n?: { en?: string; ptBR?: string; es?: string } | null;
  gameSlug?: string | null;
  sortOrder?: number;
};

export type AdminMiniPassSeasonDetail = {
  id: number;
  slug?: string;
  titleI18n?: { en?: string; ptBR?: string; es?: string } | null;
  subtitleI18n?: { en?: string; ptBR?: string; es?: string } | null;
  startsAt?: string | Date;
  endsAt?: string | Date;
  maxLevel?: number;
  xpPerLevel?: number;
  buyLevelPricePol?: string | number | null;
  completePassPricePol?: string | number | null;
  bannerImageUrl?: string | null;
  isActive?: boolean;
  levelRewards?: AdminMiniPassLevelRewardRow[];
  missions?: AdminMiniPassMissionRow[];
};

export type AdminMiniPassSeasonGetResponse =
  | { ok: true; season: AdminMiniPassSeasonDetail }
  | { ok: false; message?: string };

export type AdminMiniPassSeasonWriteResponse =
  | { ok: true; season?: AdminMiniPassSeasonDetail & { id?: number } }
  | { ok: false; message?: string };

/** Row from GET `/admin/miners` (catalog search for reward pickers). */
export type AdminMinerCatalogRow = {
  id: string | number;
  name?: string | null;
  baseHashRate?: string | number | null;
  slotSize?: number | null;
  imageUrl?: string | null;
  isActive?: boolean;
};

export type AdminMinersListResponse = {
  miners?: AdminMinerCatalogRow[];
};

/** Row from GET `/admin/offer-events` (`adminListOfferEvents`). */
export type AdminOfferEventListRow = {
  id: number;
  title: string;
  description?: string;
  imageUrl?: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  isActive: boolean;
  deletedAt?: string | Date | null;
  minerCount?: number;
  purchaseCount?: number;
  unitSales?: number;
  uniqueBuyers?: number;
  checkoutBatches?: number;
  revenuePol?: number;
};

/** Tabs on `/admin/offer-events/:id?tab=`. */
export type AdminOfferEventManageTab = "event" | "miners" | "sales";

/** Form state for create/update offer event (admin UI). */
export type AdminOfferEventManageFormState = {
  title: string;
  description: string;
  imageUrl: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

/** Event row from GET `/admin/offer-events/:id` (Prisma `offerEvent` + optional `_count`). */
export type AdminOfferEventDetail = {
  id: number;
  title: string;
  description: string;
  imageUrl?: string | null;
  startsAt: string | Date;
  endsAt: string | Date;
  isActive: boolean;
  deletedAt?: string | Date | null;
  _count?: { miners: number; purchases: number };
};

export type AdminOfferEventGetResponse = { ok: true; event: AdminOfferEventDetail } | { ok: false; message?: string };

export type AdminOfferEventMutationResponse =
  | { ok: true; event?: AdminOfferEventDetail; message?: string }
  | { ok: false; message?: string; errors?: unknown };

/** Event miner row from GET `/admin/offer-events/:eventId/miners`. */
export type AdminOfferEventMinerRow = {
  id: number;
  eventId?: number;
  name: string;
  description: string;
  imageUrl?: string | null;
  price: string | number;
  hashRate: number;
  currency: string;
  stockUnlimited: boolean;
  stockCount?: number | null;
  soldCount?: number;
  slotSize?: number;
  isActive: boolean;
  isFree: boolean;
  claimLimitPerUser?: number;
};

export type AdminOfferEventMinersListResponse =
  | { ok: true; miners: AdminOfferEventMinerRow[]; event?: AdminOfferEventDetail }
  | { ok: false; message?: string };

export type AdminOfferEventPurchaseUser = {
  id?: number;
  email?: string | null;
  username?: string | null;
  name?: string | null;
};

export type AdminOfferEventPurchaseRow = {
  id: number;
  userId: number;
  eventMinerId?: number;
  pricePaid: number;
  unitPrice?: number;
  quantity?: number;
  totalPaid?: number;
  currency: string;
  createdAt: string | Date;
  user?: AdminOfferEventPurchaseUser | null;
  minerName?: string | null;
};

export type AdminOfferEventPurchasesListResponse =
  | {
      ok: true;
      purchases: AdminOfferEventPurchaseRow[];
      page?: number;
      pageSize?: number;
      total?: number;
      stats?: {
        unitSales: number;
        uniqueBuyers: number;
        checkoutBatches: number;
        revenuePol: number;
      };
    }
  | { ok: false; message?: string };

/** Local form for create/edit event miner modal. */
export type AdminOfferEventMinerFormState = {
  name: string;
  description: string;
  imageUrl: string;
  price: string;
  hashRate: string;
  currency: string;
  stockUnlimited: boolean;
  stockCount: string;
  slotSize: 1 | 2;
  isActive: boolean;
  isFree: boolean;
  claimLimitPerUser: number | string;
};

/** GET `/admin/server-metrics` — `metrics` payload (see `adminController.getServerMetrics`). */
export interface EventLoopLagSnapshot {
  maxMs: number;
  meanMs: number;
  p99Ms: number;
  sampleWindowMs: number;
}

export interface HealthCheckDetail {
  ok: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface AdminOpsHttpStats {
  requestsTotal: number;
  errors4xxTotal: number;
  errors5xxTotal: number;
  requestsPerMinuteEstimate: number;
}

export interface AdminOpsMiningStats {
  blockNumber: number;
  activeMiners: number;
  engineRunning: boolean;
}

export interface AdminOpsQueueStats {
  bullmqWaiting: number;
  bullmqActive: number;
  bullmqFailed: number;
}

export interface AdminOpsRedisStats {
  connected: number;
}

export interface AdminOpsEconomyRow {
  module: string;
  action: string;
  total: number;
}

export interface AdminOpsAlert {
  id: string;
  severity: string;
  message: string;
  module: string;
  since: string;
}

export interface RuntimeRegistrySnapshot {
  nodeVersion: string;
  platform: string;
  pid: number;
  uptimeSeconds: number;
  memoryRssBytes: number;
  memoryHeapUsedBytes: number;
}

/** Real GET `/admin/ops/snapshot` payload. */
export type AdminOpsSnapshot = {
  timestamp: string;
  readiness: {
    ok: boolean;
    checks: Record<string, HealthCheckDetail>;
  };
  eventLoopLag: EventLoopLagSnapshot;
  runtime: RuntimeRegistrySnapshot;
  http: AdminOpsHttpStats;
  socket: {
    connectionsActive: number;
    connectsTotal: number;
    disconnectsTotal: number;
  };
  mining: AdminOpsMiningStats;
  queues: AdminOpsQueueStats;
  redis: AdminOpsRedisStats;
  economy: AdminOpsEconomyRow[];
  alerts: AdminOpsAlert[];
};

export type AdminOpsSnapshotResponse =
  | { ok: true; snapshot: AdminOpsSnapshot }
  | { ok: false; message?: string; code?: string };

export type AdminServerMetricsSnapshot = {
  cpuUsagePercent: number;
  cpuCores: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  memoryUsagePercent: number;
  diskTotalBytes: number | null;
  diskUsedBytes: number | null;
  diskUsagePercent: number | null;
  diskUnavailable: boolean;
  uptimeSeconds: number;
  processUptimeSeconds?: number;
  platform: string;
  nodeVersion: string;
  processId: number;
};

export type AdminServerMetricsSuccessResponse = {
  ok: true;
  metrics: AdminServerMetricsSnapshot;
};

export type AdminServerMetricsErrorResponse = {
  ok: false;
  message?: string;
};

export type AdminServerMetricsResponse = AdminServerMetricsSuccessResponse | AdminServerMetricsErrorResponse;

export interface AdminProfileUser {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
  lastLoginIp?: string | null;
  lastLoginUa?: string | null;
  activeSessionsCount?: number;
  auditCount?: number;
}

export type AdminUserItem = AdminProfileUser;

export interface AdminProfileResponse {
  ok: boolean;
  admin: AdminProfileUser;
  activeSessionsCount: number;
  totalAuditCount: number;
  currentSessionId: string | null;
}

export interface AdminSessionItem {
  id: string;
  adminId: number;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}

export interface AdminAuditLogRow {
  id: string;
  adminId: number | null;
  adminEmail?: string | null;
  sessionId?: string | null;
  action: string;
  module: string | null;
  resource: string | null;
  resourceId: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  success: boolean;
  errorMsg: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  durationMs?: number | null;
  createdAt: string;
  admin?: { id?: number; name: string; email: string; role?: string } | null;
}

export interface AdminAuditStats {
  total: number;
  successCount: number;
  failedCount: number;
  last24hCount: number;
  last7dCount: number;
  successRate: number;
  topActions: { action: string; count: number }[];
  modulesBreakdown: { module: string; count: number }[];
  admins: { id: number; name: string; email: string; role: string }[];
}

export interface AdminAuditListResponse {
  ok: boolean;
  rows: AdminAuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminAuditStatsResponse {
  ok: boolean;
  stats: AdminAuditStats;
}

// ─── Broadcast Notifications ──────────────────────────────────────────────
export interface AdminBroadcastMessage {
  id: number;
  title: string;
  content?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  dismissDelaySeconds?: number;
  linkUrl?: string | null;
  linkLabel?: string | null;
  linkNewTab?: boolean;
  createdAt: string | Date;
  _count?: { views?: number };
}

export interface AdminBroadcastForm {
  title: string;
  content: string;
  imageUrl: string;
  isActive: boolean;
  dismissDelaySeconds: number;
  linkUrl: string;
  linkLabel: string;
  linkNewTab: boolean;
}

export interface AdminBroadcastListResponse {
  ok: boolean;
  messages: AdminBroadcastMessage[];
}

export interface AdminBroadcastMutationResponse {
  ok: boolean;
  message?: AdminBroadcastMessage;
}

export interface AdminBroadcastResetViewsResponse {
  ok: boolean;
  clearedViewsCount: number;
  message: string;
}

// ─── Database Backups & Cloud Sync ───────────────────────────────────────
export type BackupIntegrityStatus = "valid" | "corrupted" | "unverified";

export type AdminBackupRow = {
  name: string;
  size: number;
  created: string;
  status: string;
  publicTableCount?: number | null;
  durationMs?: number | null;
  copyPublicLineCount?: number | null;
  criticalTablesPresent?: unknown[] | null;
  totalDataRows?: number | null;
  publicTablesWithRows?: number | null;
  publicTablesEmpty?: number | null;
  criticalRowCounts?: Record<string, unknown> | null;
  rowCountAuditMode?: string | null;
  bundleName?: string | null;
  bundleSize?: number | null;
  bundleIncludedPaths?: string[];
  sha256?: string | null;
  integrityStatus?: BackupIntegrityStatus | null;
  lastVerifiedAt?: string | null;
  integrityErrors?: string[] | null;
  googleDrive?: {
    uploadedAt?: string;
    folderId?: string;
    fileId?: string;
    webViewLink?: string;
    md5Checksum?: string;
    bundleFileId?: string;
  } | null;
};

export type AdminBackupsListResponse = {
  ok: boolean;
  backups?: AdminBackupRow[];
  backupsDir?: string;
  message?: string;
};

export type AdminBackupCreateResponse = {
  ok: boolean;
  message?: string;
  backup?: AdminBackupRow;
};

export type BackupIntegrityReport = {
  ok: boolean;
  filename: string;
  sizeBytes: number;
  sha256: string;
  status: "valid" | "corrupted";
  verifiedAt: string;
  checks: {
    sizeOk: boolean;
    headerOk: boolean;
    footerOk: boolean;
    criticalTablesOk: boolean;
    hashMatch: boolean;
    bundleOk?: boolean;
  };
  missingCriticalTables: string[];
  errors: string[];
};

export type AdminBackupVerifyResponse = {
  ok: boolean;
  report?: BackupIntegrityReport;
  message?: string;
};

export type GoogleDriveStatus = {
  isConfigured: boolean;
  isConnected: boolean;
  folderId?: string | null;
  folderName?: string | null;
  userEmail?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

export type GoogleDriveStatusResponse = {
  ok: boolean;
  status?: GoogleDriveStatus;
  message?: string;
};

export type GoogleDriveAuthUrlResponse = {
  ok: boolean;
  authUrl?: string;
  message?: string;
};

export type GoogleDriveConnectResponse = {
  ok: boolean;
  message: string;
  hasRefreshToken?: boolean;
};

export type GoogleDriveUploadResponse = {
  ok: boolean;
  message: string;
  upload?: {
    filename: string;
    sqlUpload: {
      fileId: string;
      name: string;
      size: number;
      md5Checksum?: string;
      webViewLink?: string;
    };
    bundleUpload?: {
      fileId: string;
      name: string;
      size: number;
      md5Checksum?: string;
      webViewLink?: string;
    };
  };
};

// ─── System Logs (AuditLog) ───────────────────────────────────────────────
export interface AdminSystemLogItem {
  id: number;
  userId: number | null;
  user_id?: number | null;
  user_email?: string | null;
  user?: { email?: string | null; username?: string | null } | null;
  action: string;
  label?: string | null;
  description?: string | null;
  source: string;
  severity: string;
  ip?: string | null;
  userAgent?: string | null;
  detailsJson?: unknown;
  metadata?: unknown;
  actorAdminId?: number | null;
  createdAt: string | Date;
  created_at?: string | Date;
}

export interface AdminSystemLogsResponse {
  ok: boolean;
  logs: AdminSystemLogItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  sourcesSummary?: { source: string; count: number }[];
  severitiesSummary?: { severity: string; count: number }[];
}

export interface AdminSystemLogsQueryParams {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  source?: string;
  severity?: string;
  action?: string;
  userId?: number;
  q?: string;
  from?: string;
  to?: string;
}




