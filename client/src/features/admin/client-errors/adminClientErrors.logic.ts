/** Ported from legacy/client/src/pages/admin/AdminClientErrors/adminClientErrors.logic.ts. */
import type {
  ClientErrorCategory,
  ClientErrorFilters,
  ClientErrorRow,
  ClientErrorStats,
  ClientErrorUser,
  Criticality,
  DecoratedRow,
  UserGroup,
} from './adminClientErrors.types';

export const CRITICALITIES: Criticality[] = ['critical', 'high', 'warning', 'info'];
export const CATEGORIES: ClientErrorCategory[] = ['crash', 'api_failure'];

const CRITICALITY_RANK: Record<Criticality, number> = {
  critical: 3,
  high: 2,
  warning: 1,
  info: 0,
};

export function categoryOf(r: Pick<ClientErrorRow, 'action' | 'metadata'>): ClientErrorCategory {
  const m = r.metadata;
  if (m?.category === 'api_failure' || r.action === 'client_api_failure') return 'api_failure';
  return 'crash';
}

const TIMEOUT_RE = /timeout|ECONNABORTED|timed? ?out/i;
const NETWORK_RE = /network error|ERR_NETWORK|failed to fetch|connection/i;

/**
 * How badly the event hurts the user:
 * - crash (ErrorBoundary / global handler) → always CRITICAL, the app UI actually broke.
 * - api_failure with a 5xx (incl. Cloudflare 520/580) → CRITICAL, the backend/origin failed.
 * - a request timeout or network drop → HIGH, the user is stuck waiting with no answer.
 * - a 4xx (business rule, auth, validation) → WARNING, usually expected/handled UX.
 * - anything else → INFO.
 */
export function deriveCriticality(r: Pick<ClientErrorRow, 'action' | 'metadata' | 'label' | 'description'>): Criticality {
  if (categoryOf(r) === 'crash') return 'critical';
  const status = r.metadata?.statusCode ?? null;
  if (status != null && status >= 500) return 'critical';
  const haystack = `${r.label ?? ''} ${r.metadata?.code ?? ''} ${r.description ?? ''}`;
  if (TIMEOUT_RE.test(haystack) || NETWORK_RE.test(haystack)) return 'high';
  if (status != null && status >= 400 && status < 500) return 'warning';
  return 'info';
}

/** A short, groupable endpoint label: the API operation/path, stripped of query + volatile ids. */
export function endpointOf(r: Pick<ClientErrorRow, 'metadata' | 'label'>): string {
  const raw =
    r.metadata?.operation ||
    (r.metadata as { url?: string } | null)?.url ||
    r.label ||
    '(unknown)';
  const method = /^(GET|POST|PUT|PATCH|DELETE)\b/i.exec(raw)?.[0]?.toUpperCase();
  // Keep only the path portion, drop query string.
  const pathMatch = /(\/[^\s?]*)/.exec(raw);
  let path = pathMatch ? pathMatch[1] : raw;
  // Collapse volatile segments (uuids, long numeric ids) so the same endpoint groups together.
  path = path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d{3,}(?=\/|$)/g, '/:id');
  return method ? `${method} ${path}` : path;
}

export function decorate(r: ClientErrorRow): DecoratedRow {
  return {
    ...r,
    category: categoryOf(r),
    criticality: deriveCriticality(r),
    endpoint: endpointOf(r),
  };
}

export function decorateAll(rows: ClientErrorRow[]): DecoratedRow[] {
  return rows.map(decorate);
}

export function worstOf(list: Criticality[]): Criticality {
  return list.reduce<Criticality>(
    (worst, c) => (CRITICALITY_RANK[c] > CRITICALITY_RANK[worst] ? c : worst),
    'info',
  );
}

export function emptyCriticalityCounts(): Record<Criticality, number> {
  return { critical: 0, high: 0, warning: 0, info: 0 };
}

/** Stable per-actor grouping key: authenticated users by id, otherwise by IP, else `anon`. */
export function actorKey(r: Pick<ClientErrorRow, 'userId' | 'ip'>): string {
  if (r.userId != null) return `user:${r.userId}`;
  if (r.ip) return `ip:${r.ip}`;
  return 'anon';
}

export function matchesFilters(r: DecoratedRow, f: ClientErrorFilters): boolean {
  if (f.criticalities.size > 0 && !f.criticalities.has(r.criticality)) return false;
  if (f.categories.size > 0 && !f.categories.has(r.category)) return false;
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    r.label,
    r.endpoint,
    r.ip,
    r.user?.name,
    r.userId != null ? String(r.userId) : '',
    r.metadata?.url,
    r.metadata?.code,
    r.metadata?.requestId,
    r.metadata?.statusCode != null ? String(r.metadata.statusCode) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function filterRows(rows: DecoratedRow[], f: ClientErrorFilters): DecoratedRow[] {
  return rows.filter((r) => matchesFilters(r, f));
}

/**
 * Group reports by the acting user (or anonymous IP), newest activity first, so an admin can see
 * "who is hitting errors" rather than one flat undifferentiated stream.
 */
export function groupByUser(rows: DecoratedRow[]): UserGroup[] {
  const groups = new Map<string, UserGroup>();
  for (const r of rows) {
    const key = actorKey(r);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        user: r.user ?? null,
        ip: r.ip ?? null,
        rows: [],
        counts: emptyCriticalityCounts(),
        worst: 'info',
        lastAt: r.createdAt,
      };
      groups.set(key, g);
    }
    g.rows.push(r);
    g.counts[r.criticality] += 1;
    if (!g.user && r.user) g.user = r.user;
    if (!g.ip && r.ip) g.ip = r.ip;
    if (r.createdAt > g.lastAt) g.lastAt = r.createdAt;
  }
  const list = Array.from(groups.values());
  for (const g of list) {
    g.worst = worstOf(g.rows.map((r) => r.criticality));
    g.rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  // Worst-hit and most-recent groups float to the top.
  list.sort((a, b) => {
    const byWorst = CRITICALITY_RANK[b.worst] - CRITICALITY_RANK[a.worst];
    if (byWorst !== 0) return byWorst;
    const byCount = b.rows.length - a.rows.length;
    if (byCount !== 0) return byCount;
    return a.lastAt < b.lastAt ? 1 : -1;
  });
  return list;
}

export function computeStats(rows: DecoratedRow[]): ClientErrorStats {
  const byCriticality = emptyCriticalityCounts();
  const byCategory: Record<ClientErrorCategory, number> = { crash: 0, api_failure: 0 };
  const endpointCounts = new Map<string, number>();
  const userCounts = new Map<string, { user: ClientErrorUser | null; ip: string | null; count: number }>();
  const affectedUserIds = new Set<number>();
  let anonymousEvents = 0;
  let firstAt: string | null = null;
  let lastAt: string | null = null;

  for (const r of rows) {
    byCriticality[r.criticality] += 1;
    byCategory[r.category] += 1;
    endpointCounts.set(r.endpoint, (endpointCounts.get(r.endpoint) ?? 0) + 1);
    const key = actorKey(r);
    const existing = userCounts.get(key);
    if (existing) existing.count += 1;
    else userCounts.set(key, { user: r.user ?? null, ip: r.ip ?? null, count: 1 });
    if (r.userId != null) affectedUserIds.add(r.userId);
    else anonymousEvents += 1;
    if (firstAt === null || r.createdAt < firstAt) firstAt = r.createdAt;
    if (lastAt === null || r.createdAt > lastAt) lastAt = r.createdAt;
  }

  const topEndpoints = Array.from(endpointCounts.entries())
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const topUsers = Array.from(userCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    total: rows.length,
    byCriticality,
    byCategory,
    affectedUsers: affectedUserIds.size,
    anonymousEvents,
    topEndpoints,
    topUsers,
    firstAt,
    lastAt,
  };
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', { hour12: false });
  } catch {
    return iso;
  }
}

export function actorLabel(g: Pick<UserGroup, 'user' | 'ip' | 'key'>): string {
  if (g.user) return `${g.user.name} (#${g.user.id})`;
  if (g.ip) return `Anônimo · ${g.ip}`;
  return 'Anônimo';
}

export function buildClipboardText(r: DecoratedRow): string {
  const meta = r.metadata ?? {};
  return [
    `# [${r.criticality}] [${r.category}] ${r.label}`,
    `When: ${formatTime(r.createdAt)}`,
    `Criticality: ${r.criticality}`,
    `Category: ${r.category}`,
    r.user ? `User: ${r.user.name} (#${r.user.id})` : r.userId != null ? `UserId: ${r.userId}` : 'User: (anonymous)',
    `Endpoint: ${r.endpoint}`,
    meta.operation ? `Operation: ${meta.operation}` : null,
    meta.statusCode != null ? `StatusCode: ${meta.statusCode}` : null,
    meta.code ? `Code: ${meta.code}` : null,
    meta.requestId ? `RequestId: ${meta.requestId}` : null,
    `URL: ${meta.url ?? '(unknown)'}`,
    `IP: ${r.ip ?? '(unknown)'}`,
    `User-Agent: ${r.userAgent ?? '(unknown)'}`,
    `BuildId: ${meta.buildId ?? '(unknown)'}`,
    '',
    '## Stack',
    meta.stack || r.description || '(none)',
    '',
    '## Component stack',
    meta.componentStack || '(none)',
  ]
    .filter(Boolean)
    .join('\n');
}
