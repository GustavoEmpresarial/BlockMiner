/**
 * Fraud-signals admin service — PARTIAL port of
 * legacy/server/services/adminFraudSignalsService.ts.
 *
 * Scope: only the parts of legacy's listAdminFraudSignals that need raw
 * Postgres queries against `users` and `ip_logs` (current's UserIpLog model,
 * @@map("ip_logs")) are ported — duplicate wallet_address clusters
 * (queryDuplicateUsers) and duplicate registration_ip / last_ip / ip_logs.ip /
 * ip_logs.device_fingerprint clusters (queryIpUsers / queryIpLogUsers).
 *
 * NOT ported (confirmed absent from current/server, unlike the two below):
 *  - legacy's onchain_wallet / asn / ip_network derived-subnet grouping
 *    (queryTransactionAddressUsers, pushDerivedGrouped, ASN scan over up to
 *    1500 recent users) — those extra cluster kinds are out of scope for
 *    this pass; only wallet/ip/device clusters that already existed here are
 *    risk-scored.
 *
 * PORTED as of this pass (previously the note below said "no ip-intelligence
 * enrichment, no risk scoring" — that was stale for ip-intelligence, which
 * had already been ported and was already used by the sibling POST
 * /refresh-ip route; risk scoring was the genuine gap):
 *  - ip-intelligence (../ip-intelligence/index.ts) — getCachedIpIntelligence
 *    enriches registration_ip / last_ip / ip_log clusters with cached
 *    ASN/PTR/proxy metadata, same as legacy.
 *  - admin.multi-account-risk.ts (TS port of
 *    services/multiAccountRiskService.js's calculateMultiAccountRisk) — real
 *    risk score/level/confidence/decision per cluster, replacing the
 *    `riskScore: null, riskLevel: "not_computed"` placeholders.
 */
import { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../core/database/prisma.js";
import { getCachedIpIntelligence, normalizeIp } from "../ip-intelligence/index.js";
import { calculateMultiAccountRisk, type RiskGroupInput, type MultiAccountRiskResult } from "./admin.multi-account-risk.js";

export type FraudScope = "all" | "wallets" | "ips" | "devices";
const ALLOWED_SCOPES: ReadonlySet<FraudScope> = new Set(["all", "wallets", "ips", "devices"]);

export class InvalidFraudQueryError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "InvalidFraudQueryError";
  }
}

function parsePage(value: unknown): number {
  if (value === undefined || value === null || value === "") return 1;
  const s = String(value).trim();
  if (!/^\d{1,5}$/.test(s)) throw new InvalidFraudQueryError("invalid_page");
  return Math.max(1, Number(s));
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return 40;
  const s = String(value).trim();
  if (!/^\d{1,3}$/.test(s)) throw new InvalidFraudQueryError("invalid_limit");
  return Math.max(1, Math.min(100, Number(s)));
}

function parseScope(value: unknown): FraudScope {
  const s = String(value ?? "all").trim() || "all";
  if (!ALLOWED_SCOPES.has(s as FraudScope)) throw new InvalidFraudQueryError("invalid_scope");
  return s as FraudScope;
}

type FraudUserRow = {
  id: number;
  username: string | null;
  email: string;
  walletAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
  key: string;
};

type FraudCluster = {
  id: string;
  kind: string;
  signalType: string;
  key: string;
  userCount: number;
  users: Array<{
    id: number;
    username: string | null;
    email: string;
    walletAddress: string | null;
    createdAt: Date;
    lastLoginAt: Date | null;
  }>;
  riskScore: number;
  riskLevel: MultiAccountRiskResult["level"];
  confidence: MultiAccountRiskResult["confidence"];
  reasons: string[];
  falsePositiveWarnings: string[];
  identityVectors: string[];
  decision: MultiAccountRiskResult["decision"];
};

/** Maps this service's cluster signalType to multiAccountRiskService's vocabulary. */
const RISK_SIGNAL_TYPE: Record<string, string> = {
  wallet: "profile_wallet",
  registration_ip: "registration_ip",
  last_ip: "last_ip",
  ip_log: "auth_ip_history",
  device_fingerprint: "device_fingerprint",
};

/** signalTypes whose `key` is a stored IP eligible for ip-intelligence (ASN/PTR/proxy) enrichment. */
const IP_KEYED_SIGNAL_TYPES = new Set(["registration_ip", "last_ip", "ip_log"]);

async function queryDuplicateUsers(prisma: AppPrisma, column: "wallet_address"): Promise<FraudUserRow[]> {
  const fieldSql = Prisma.raw(column);
  const userFieldSql = Prisma.raw(`u.${column}`);
  return prisma.$queryRaw<FraudUserRow[]>`
    WITH d AS (
      SELECT LOWER(BTRIM(${fieldSql})) AS k, COUNT(*)::int AS c
      FROM users
      WHERE ${fieldSql} IS NOT NULL AND BTRIM(${fieldSql}) <> ''
      GROUP BY 1
      HAVING COUNT(*) > 1
    )
    SELECT u.id, u.username, u.email, u.wallet_address AS "walletAddress", u.user_agent AS "userAgent",
           u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", LOWER(BTRIM(${userFieldSql})) AS key
    FROM users u
    INNER JOIN d ON LOWER(BTRIM(${userFieldSql})) = d.k
    ORDER BY d.c DESC, key, u.id
    LIMIT 600
  `;
}

async function queryIpUsers(prisma: AppPrisma, column: "registration_ip" | "last_ip"): Promise<FraudUserRow[]> {
  const fieldSql = Prisma.raw(column);
  const userFieldSql = Prisma.raw(`u.${column}`);
  return prisma.$queryRaw<FraudUserRow[]>`
    WITH d AS (
      SELECT ${fieldSql} AS k, COUNT(*)::int AS c
      FROM users
      WHERE ${fieldSql} IS NOT NULL AND BTRIM(${fieldSql}) <> ''
      GROUP BY ${fieldSql}
      HAVING COUNT(*) > 1
    )
    SELECT u.id, u.username, u.email, u.wallet_address AS "walletAddress", u.user_agent AS "userAgent",
           u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", ${userFieldSql} AS key
    FROM users u
    INNER JOIN d ON ${userFieldSql} = d.k
    ORDER BY d.c DESC, key, u.id
    LIMIT 600
  `;
}

async function queryIpLogUsers(prisma: AppPrisma, column: "ip" | "device_fingerprint"): Promise<FraudUserRow[]> {
  const fieldSql = Prisma.raw(`l.${column}`);
  return prisma.$queryRaw<FraudUserRow[]>`
    WITH d AS (
      SELECT ${fieldSql} AS k, COUNT(DISTINCT l.user_id)::int AS c
      FROM ip_logs l
      WHERE ${fieldSql} IS NOT NULL AND BTRIM(${fieldSql}) <> ''
      GROUP BY ${fieldSql}
      HAVING COUNT(DISTINCT l.user_id) > 1
    )
    SELECT u.id, u.username, u.email, u.wallet_address AS "walletAddress", u.user_agent AS "userAgent",
           u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt", ${fieldSql} AS key
    FROM ip_logs l
    INNER JOIN d ON ${fieldSql} = d.k
    INNER JOIN users u ON u.id = l.user_id
    ORDER BY d.c DESC, key, u.id
  `;
}

function normalizeWalletKey(value: string | null): string | null {
  const s = String(value || "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(s) ? s : null;
}

async function groupIntoClusters(
  prisma: AppPrisma,
  rows: FraudUserRow[],
  kind: string,
  signalType: string,
): Promise<FraudCluster[]> {
  const byKey = new Map<string, FraudUserRow[]>();
  for (const row of rows) {
    const key = String(row.key || "").trim();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(row);
  }

  const clusters: FraudCluster[] = [];
  for (const [key, users] of byKey) {
    const deduped = [...new Map(users.map((u) => [u.id, u])).values()];
    if (deduped.length < 2) continue;

    // ip-intelligence enrichment (ASN/PTR/proxy) — only meaningful for IP-keyed clusters.
    // Reuses the same cached lookup already wired into POST /refresh-ip.
    let ipIntelligence: Awaited<ReturnType<typeof getCachedIpIntelligence>> = null;
    if (IP_KEYED_SIGNAL_TYPES.has(signalType)) {
      const ip = normalizeIp(key);
      if (ip) {
        ipIntelligence = await getCachedIpIntelligence(prisma, ip).catch(() => null);
      }
    }

    // Cross-signal correlation inputs mirroring legacy's buildGroup: does this cluster's
    // group of users ALSO share a wallet / device (user-agent) beyond the primary signal.
    const walletCounts = new Map<string, number>();
    const deviceCounts = new Map<string, number>();
    for (const u of deduped) {
      const wallet = normalizeWalletKey(u.walletAddress);
      if (wallet) walletCounts.set(wallet, (walletCounts.get(wallet) || 0) + 1);
      const ua = String(u.userAgent || "").trim();
      if (ua) deviceCounts.set(ua, (deviceCounts.get(ua) || 0) + 1);
    }
    const created = deduped
      .map((u) => new Date(u.createdAt).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    const shortCreationWindow = created.length >= 2 && created[created.length - 1] - created[0] <= 24 * 60 * 60 * 1000;

    const riskInput: RiskGroupInput = {
      signalType: RISK_SIGNAL_TYPE[signalType] || signalType,
      fraudKind: kind,
      key,
      userCount: deduped.length,
      users: deduped.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        walletAddress: u.walletAddress,
        userAgent: u.userAgent,
      })),
      ipIntelligence: ipIntelligence
        ? {
            reverseDns: ipIntelligence.reverseDns,
            normalizedIp: ipIntelligence.normalizedIp,
            providerLabel: ipIntelligence.providerLabel,
            providerType: ipIntelligence.providerType,
            asnOrg: ipIntelligence.asnOrg,
            proxyDetected: ipIntelligence.proxyDetected,
            proxyType: ipIntelligence.proxyType,
          }
        : null,
      sameWalletCount: [...walletCounts.values()].filter((n) => n > 1).length,
      sameDeviceCount: [...deviceCounts.values()].filter((n) => n > 1).length,
      shortCreationWindow,
    };
    const risk = calculateMultiAccountRisk(riskInput);

    clusters.push({
      id: `${signalType}:${key}`,
      kind,
      signalType,
      key,
      userCount: deduped.length,
      users: deduped.slice(0, 25).map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        walletAddress: u.walletAddress,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      })),
      riskScore: risk.score,
      riskLevel: risk.level,
      confidence: risk.confidence,
      reasons: risk.reasons,
      falsePositiveWarnings: risk.falsePositiveWarnings,
      identityVectors: risk.identityVectors,
      decision: risk.decision,
    });
  }
  return clusters;
}

export type ListAdminFraudSignalsOpts = {
  scope?: unknown;
  page?: unknown;
  limit?: unknown;
};

export async function listAdminFraudSignals(prisma: AppPrisma, opts: ListAdminFraudSignalsOpts = {}) {
  const scope = parseScope(opts.scope);
  const page = parsePage(opts.page);
  const limit = parseLimit(opts.limit);

  const clusters: FraudCluster[] = [];

  if (scope === "all" || scope === "wallets") {
    const rows = await queryDuplicateUsers(prisma, "wallet_address");
    clusters.push(...(await groupIntoClusters(prisma, rows, "wallet_duplicate", "wallet")));
  }
  if (scope === "all" || scope === "ips") {
    const [regRows, lastRows, logRows] = await Promise.all([
      queryIpUsers(prisma, "registration_ip"),
      queryIpUsers(prisma, "last_ip"),
      queryIpLogUsers(prisma, "ip"),
    ]);
    clusters.push(...(await groupIntoClusters(prisma, regRows, "ip_duplicate", "registration_ip")));
    clusters.push(...(await groupIntoClusters(prisma, lastRows, "ip_duplicate", "last_ip")));
    clusters.push(...(await groupIntoClusters(prisma, logRows, "ip_duplicate", "ip_log")));
  }
  if (scope === "all" || scope === "devices") {
    const rows = await queryIpLogUsers(prisma, "device_fingerprint");
    clusters.push(...(await groupIntoClusters(prisma, rows, "device_duplicate", "device_fingerprint")));
  }

  clusters.sort((a, b) => b.riskScore - a.riskScore || b.userCount - a.userCount || a.key.localeCompare(b.key));

  const total = clusters.length;
  const start = (page - 1) * limit;
  const signals = clusters.slice(start, start + limit);

  return {
    scope,
    page,
    limit,
    total,
    signalCount: signals.length,
    signals,
    generatedAt: new Date().toISOString(),
    note: "Clusters (wallet/IP/device duplicates) are risk-scored via admin.multi-account-risk.ts (port of legacy multiAccountRiskService). IP-keyed clusters (registration_ip/last_ip/ip_log) are enriched with cached ip-intelligence (ASN/PTR/proxy). Not ported in this pass: legacy's onchain_wallet (transaction-address) and derived asn/ip_network subnet clusters — only the wallet/IP/device cluster kinds already present in this service are scored.",
  };
}

/** Must match admin POST body `confirm`. Overridable via env for ops flexibility. */
export function getFraudCollectionResetConfirmPhrase(): string {
  return String(process.env.ADMIN_FRAUD_COLLECTION_RESET_CONFIRM || "").trim() || "RESET_FRAUD_COLLECTION";
}

/**
 * Clears anti-fraud **collection** data only. Ported faithfully from legacy's
 * resetAdminFraudCollectionData.
 *  - `ip_logs` (UserIpLog): login/register IP + device fingerprint history.
 *  - `ip_intelligence_cache` (IpIntelligenceCache): cached ASN/PTR/proxy lookups.
 *  - `users`: clears registration_ip, last_ip (User.ip), user_agent only.
 * Does not alter wallet addresses, balances, payouts, deposits, or transactions.
 */
export async function resetAdminFraudCollectionData(prisma: AppPrisma) {
  return prisma.$transaction(async (tx) => {
    const logRes = await tx.userIpLog.deleteMany({});
    const intelRes = await tx.ipIntelligenceCache.deleteMany({});
    const profileRes = await tx.user.updateMany({
      where: {
        OR: [{ registrationIp: { not: null } }, { ip: { not: null } }, { userAgent: { not: null } }],
      },
      data: { registrationIp: null, ip: null, userAgent: null },
    });
    return {
      ipLogsDeleted: logRes.count,
      ipIntelDeleted: intelRes.count,
      usersProfileAntiFraudCleared: profileRes.count,
    };
  });
}
