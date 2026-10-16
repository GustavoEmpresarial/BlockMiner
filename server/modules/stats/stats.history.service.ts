/**
 * User activity history for the "Estatísticas e Poder" → Histórico tab.
 * Reads the user's own AuditLog rows, hides transport noise and duplicate rows,
 * and turns raw action codes into categorized, human-readable events.
 */
import prisma from "../../core/database/prisma.js";

export type ActivityCategory =
  | "purchases"
  | "machines"
  | "youtube"
  | "faucet"
  | "shortlinks"
  | "ptc"
  | "offerwall"
  | "auto_mining"
  | "games"
  | "checkin"
  | "boosts"
  | "finance"
  | "account"
  | "general";

export interface UserActivityHistoryParams {
  userId: number;
  page?: number;
  pageSize?: number;
  category?: string;
  q?: string;
  days?: number;
}

export interface FormattedUserActivityItem {
  id: number;
  action: string;
  category: ActivityCategory;
  categoryLabel: string;
  title: string;
  description: string;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface ActivityCategorySummary {
  id: ActivityCategory | "all";
  label: string;
  count: number;
}

export interface UserActivityHistoryResult {
  ok: true;
  logs: FormattedUserActivityItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  categories: ActivityCategorySummary[];
  categoryCounts: Record<string, number>;
  windowDays: number;
}

export const HISTORY_ALLOWED_DAYS = [1, 7, 30] as const;
const HISTORY_DEFAULT_DAYS = 30;

/**
 * Rows that are not something the player did: background telemetry, polling, client
 * error reports, and the generic API row of actions that also write a richer domain
 * event (kept: youtube_claim, adlinkfly_shortlink_claimed, power_boost_activated,
 * GAME2048_CLAIM). Without this list one YouTube claim shows up twice and one
 * shortlink four times.
 */
const HIDDEN_ACTIONS = [
  "USER_API_POST_ANTIBOT_TELEMETRY",
  "USER_API_POST_SESSION_HEARTBEAT",
  "USER_API_POST_AUTH_MARK_ADBLOCK",
  "USER_API_POST_AUTH_REFRESH",
  "USER_API_POST_TRACK_CLIENT_ERROR",
  "client_api_failure",
  "client_error_report",
  "USER_API_POST_YOUTUBE_CLAIM",
  "USER_API_POST_SHORTLINK_ADLINKFLY_CLAIM",
  "USER_API_POST_SHORTLINK_ADLINKFLY_DONE",
  "USER_API_POST_SHORTLINK_COMPLETE_STEP",
  "USER_API_POST_BOOSTS_ACTIVATE",
  "USER_API_POST_GAMES_ID_CLAIM",
  "USER_API_POST_INTERNAL_OFFERWALL_ATTEMPTS_ID_PARTNER_OPENED",
];
/** Suffixes of per-tick rows (PTC heartbeats, every minigame move). */
const HIDDEN_SUFFIXES = ["_HEARTBEAT", "_MOVE"];

const CATEGORY_ORDER: ActivityCategory[] = [
  "purchases",
  "machines",
  "youtube",
  "faucet",
  "shortlinks",
  "ptc",
  "offerwall",
  "auto_mining",
  "games",
  "checkin",
  "boosts",
  "finance",
  "account",
  "general",
];

const CATEGORY_LABELS: Record<ActivityCategory | "all", string> = {
  all: "Todas",
  purchases: "Compras",
  machines: "Máquinas & Racks",
  youtube: "YouTube",
  faucet: "Faucet",
  shortlinks: "Shortlinks",
  ptc: "PTC",
  offerwall: "Offerwall",
  auto_mining: "Auto Mining",
  games: "Jogos",
  checkin: "Check-in",
  boosts: "Boosts & Recompensas",
  finance: "Carteira & Taxas",
  account: "Conta",
  general: "Outros",
};

/** First matching rule wins, so purchase rules must stay above the rack/machine rules. */
const CATEGORY_RULES: Array<{ category: ActivityCategory; patterns: string[] }> = [
  {
    category: "purchases",
    patterns: ["SHOP_PURCHASE", "SHOP_BUY", "OFFER_EVENTS_PURCHASE", "OFFER_EVENTS_BUY", "_RACK_BUY", "ROOMS_BUY", "MINI_PASS_PURCHASE"],
  },
  { category: "youtube", patterns: ["YOUTUBE"] },
  { category: "faucet", patterns: ["FAUCET"] },
  { category: "shortlinks", patterns: ["SHORTLINK"] },
  { category: "ptc", patterns: ["PTC"] },
  { category: "offerwall", patterns: ["OFFERWALL", "ZERADS", "OFFERWALLME", "MULTIWALL"] },
  { category: "auto_mining", patterns: ["AUTO_MINING"] },
  { category: "games", patterns: ["GAME", "MINIGAME"] },
  { category: "checkin", patterns: ["CHECKIN"] },
  { category: "boosts", patterns: ["BOOST", "REWARD_INBOX", "BURN", "MINI_PASS", "TASK"] },
  {
    category: "machines",
    patterns: ["RACK", "ROOM", "VAULT", "FAN_PLACEMENT", "SHOWCASE", "INVENTORY", "MINER"],
  },
  {
    category: "finance",
    patterns: ["WALLET", "WITHDRAW", "DEPOSIT", "SWAP", "TAX", "PAYOUT", "MINING_ALLOCATION", "TRANSACTION"],
  },
  {
    category: "account",
    patterns: ["AUTH", "LOGIN", "LOGOUT", "PASSWORD", "SECURITY", "2FA", "PROFILE", "NOTIFICATION", "BROADCAST"],
  },
];

function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.length > 2 ? `${parts.slice(0, 2).join(":")}:***` : ip;
  }
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.***.***` : ip;
}

export function isHiddenAction(action: string): boolean {
  return HIDDEN_ACTIONS.includes(action) || HIDDEN_SUFFIXES.some((s) => action.endsWith(s));
}

export function categorizeAction(action: string): ActivityCategory {
  const upper = (action || "").toUpperCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => upper.includes(p))) return rule.category;
  }
  return "general";
}

function parseDetails(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { raw };
    } catch {
      return { raw };
    }
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

type Copy = { title: string; description: string };

function describeAction(upper: string, details: Record<string, unknown> | null): Copy | null {
  const has = (...parts: string[]) => parts.every((p) => upper.includes(p));

  // Compras
  if (has("SHOP_PURCHASE_FAN")) return { title: "Compra de Sistema de Refrigeração", description: "Sistema de refrigeração comprado na loja." };
  if (has("SHOP_PURCHASE_RACK")) return { title: "Compra de Rack", description: "Prateleira de rack comprada na loja." };
  if (has("OFFER_EVENTS_PURCHASE_FAN")) return { title: "Compra de Refrigeração (Oferta)", description: "Sistema de refrigeração comprado em oferta." };
  if (has("OFFER_EVENTS_PURCHASE_RACK")) return { title: "Compra de Rack (Oferta)", description: "Prateleira de rack comprada em oferta." };
  if (has("RACK_BUY")) return { title: "Compra de Rack 3D", description: "Rack da Sala 3D comprado." };
  if (has("OFFER_EVENTS_PURCHASE") || has("OFFER_EVENTS_BUY")) return { title: "Compra em Oferta", description: "Item comprado na página de ofertas." };
  if (has("SHOP_PURCHASE") || has("SHOP_BUY")) return { title: "Compra de Mineradora", description: "Mineradora comprada na loja." };
  if (has("ROOMS_BUY")) return { title: "Compra de Sala", description: "Nova sala de mineração desbloqueada." };
  if (has("MINI_PASS_PURCHASE")) return { title: "Compra do Mini Pass", description: "Mini Pass adquirido." };

  // YouTube
  if (has("YOUTUBE")) {
    const capped = details?.tournamentOnly === true || details?.hashRate === 0;
    return {
      title: "Resgate do YouTube",
      description: capped
        ? "Vídeo assistido após o teto diário: +1 ponto no Torneio de YouTube, sem hashrate."
        : "Vídeo assistido: +10 H/s de poder temporário.",
    };
  }

  // Faucet
  if (has("FAUCET", "PARTNER")) return { title: "Visita a Parceiro do Faucet", description: "Página do parceiro do faucet aberta." };
  if (has("FAUCET")) return { title: "Resgate de Faucet", description: "Recompensa do faucet coletada." };

  // Shortlinks
  if (has("SHORTLINK") && (has("CLAIMED") || has("POWER"))) return { title: "Shortlink Concluído", description: "Recompensa do shortlink creditada." };
  if (has("SHORTLINK", "START")) return { title: "Shortlink Iniciado", description: "Visita a um shortlink iniciada." };
  if (has("SHORTLINK")) return { title: "Shortlink", description: "Etapa de shortlink registrada." };

  // PTC
  if (has("PTC", "SESSION_START")) return { title: "Anúncio PTC Iniciado", description: "Visualização de anúncio PTC iniciada." };
  if (has("PTC", "PAUSE")) return { title: "Anúncio PTC Pausado", description: "Visualização de anúncio PTC pausada." };
  if (has("PTC")) return { title: "Anúncio PTC", description: "Atividade em anúncio PTC registrada." };

  // Offerwall
  if (has("OFFERWALL", "SUBMIT")) return { title: "Oferta Enviada para Validação", description: "Tarefa da offerwall interna enviada para conferência." };
  if (has("OFFERWALL", "START")) return { title: "Oferta Iniciada", description: "Tarefa da offerwall interna iniciada." };
  if (has("OFFERWALL")) return { title: "Offerwall", description: "Atividade na offerwall registrada." };

  // Auto Mining
  if (has("AUTO_MINING", "CLAIM")) return { title: "Resgate de Auto Mining", description: "Poder do auto mining resgatado." };
  if (has("AUTO_MINING", "SESSION_START")) return { title: "Auto Mining Iniciado", description: "Sessão de auto mining iniciada." };
  if (has("AUTO_MINING", "PAUSE")) return { title: "Auto Mining Pausado", description: "Sessão de auto mining pausada." };
  if (has("AUTO_MINING", "RESUME")) return { title: "Auto Mining Retomado", description: "Sessão de auto mining retomada." };
  if (has("AUTO_MINING", "STOP")) return { title: "Auto Mining Encerrado", description: "Sessão de auto mining encerrada." };
  if (has("AUTO_MINING")) return { title: "Auto Mining", description: "Atividade de auto mining registrada." };

  // Jogos
  if (has("MINIGAME_PLAYED_FAILED")) return { title: "Partida Perdida", description: "Minigame encerrado sem recompensa." };
  if (has("MINIGAME_PLAYED_REWARD") || has("GAME2048_CLAIM")) return { title: "Vitória em Minigame", description: "Minigame vencido com recompensa de hashrate." };
  if (has("GAMES", "START")) return { title: "Partida Iniciada", description: "Partida de minigame iniciada." };
  if (has("GAME")) return { title: "Minigame", description: "Atividade na arena de jogos registrada." };

  // Check-in
  if (has("CHECKIN", "RECOVERY")) return { title: "Sequência de Check-in Recuperada", description: "Pagamento para recuperar a sequência de check-in." };
  if (has("CHECKIN")) return { title: "Check-in Diário", description: "Check-in diário confirmado." };

  // Boosts & recompensas
  if (has("POWER_BOOST") || has("BOOSTS_ACTIVATE")) return { title: "Power Boost Ativado", description: "Power Boost ativado na conta." };
  if (has("REWARD_INBOX")) return { title: "Recompensa Coletada", description: "Recompensa coletada da caixa de recompensas." };
  if (has("BURN", "START")) return { title: "Queima Iniciada", description: "Máquinas enviadas para a queima." };
  if (has("BURN", "CLAIM")) return { title: "Prêmio da Queima Resgatado", description: "Prêmio da queima coletado." };
  if (has("TASK")) return { title: "Missão Diária", description: "Progresso de missão diária registrado." };

  // Máquinas & racks
  if (has("RACK_UNINSTALL_BATCH")) return { title: "Rack Desmontado", description: "Todas as máquinas do rack voltaram ao inventário." };
  if (has("RACK_UNINSTALL")) return { title: "Máquina Removida do Rack", description: "Máquina retirada do rack e devolvida ao inventário." };
  if (has("RACK_INSTALL")) return { title: "Máquina Instalada no Rack", description: "Máquina colocada em um slot do rack." };
  if (has("FAN_PLACEMENT")) return { title: "Sistema de Refrigeração", description: "Refrigeração instalada ou movida (+1% sobre o poder do rack)." };
  if (has("VISUAL_PLACEMENT")) return { title: "Rack Reposicionado", description: "Rack colocado, movido ou guardado na sala." };
  if (has("VAULT", "MOVE_TO_VAULT")) return { title: "Enviado ao Armazém", description: "Máquinas guardadas no armazém." };
  if (has("VAULT", "RETRIEVE")) return { title: "Retirado do Armazém", description: "Máquinas retiradas do armazém para o inventário." };
  if (has("SHOWCASE")) return { title: "Sala 3D", description: "Máquina da Sala 3D movida para o inventário." };

  // Carteira & taxas
  if (has("WITHDRAW")) return { title: "Solicitação de Saque", description: "Pedido de saque registrado." };
  if (has("DEPOSIT")) return { title: "Depósito Enviado", description: "Depósito enviado para confirmação." };
  if (has("SWAP")) return { title: "Swap de Moedas", description: "Conversão entre moedas na carteira." };
  if (has("ENERGY_TAX") || has("TAX")) return { title: "Taxa de Energia Paga", description: "Pagamento da taxa de energia das máquinas." };
  if (has("PAYOUT_MODE")) return { title: "Modo de Pagamento Alterado", description: "Moeda de recebimento da mineração alterada." };
  if (has("MINING_ALLOCATION")) return { title: "Alocação POL/BLK Alterada", description: "Divisão do pagamento da mineração entre POL e BLK alterada." };

  // Conta
  if (has("NOTIFICATIONS")) return { title: "Notificações Lidas", description: "Notificações marcadas como lidas." };
  if (has("BROADCAST")) return { title: "Aviso Dispensado", description: "Aviso do site fechado." };
  if (has("LOGIN") || has("AUTH")) return { title: "Acesso à Conta", description: "Atividade de login ou autenticação." };

  return null;
}

export function formatActivityDetails(
  action: string,
  rawDetails: unknown,
  label?: string | null,
  description?: string | null,
): { title: string; description: string; details: Record<string, unknown> | null } {
  const details = parseDetails(rawDetails);
  if (label && description) return { title: label, description, details };

  const copy = describeAction((action || "").toUpperCase(), details);
  if (copy) return { ...copy, details };

  const fallbackTitle = action
    .replace(/^USER_API_(POST|GET|PUT|DELETE|PATCH)_/, "")
    .replace(/_ID_/g, "_")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
  return {
    title: fallbackTitle || "Atividade da Conta",
    description: description || label || "Ação registrada na conta.",
    details,
  };
}

function normalizeDays(days: unknown): number {
  const n = Number(days);
  return (HISTORY_ALLOWED_DAYS as readonly number[]).includes(n) ? n : HISTORY_DEFAULT_DAYS;
}

export async function listUserActivityHistory(
  params: UserActivityHistoryParams,
): Promise<UserActivityHistoryResult> {
  const userId = Number(params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Invalid userId");
  }

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(params.pageSize) || 15));
  const rawCategory = String(params.category || "all").toLowerCase();
  const categoryFilter = (CATEGORY_ORDER as string[]).includes(rawCategory)
    ? (rawCategory as ActivityCategory)
    : "all";
  const q = (params.q || "").trim().toLowerCase().slice(0, 80);
  const windowDays = normalizeDays(params.days);

  // audit_logs also holds every GET the user makes (tens of thousands a week), so every
  // query keeps the createdAt lower bound to stay on the (user_id, created_at) index;
  // without it the scan hits the 30s statement_timeout.
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const baseWhere = {
    userId,
    createdAt: { gte: since },
    AND: [
      { action: { notIn: HIDDEN_ACTIONS } },
      { action: { not: { startsWith: "USER_API_GET_" } } },
      ...HIDDEN_SUFFIXES.map((suffix) => ({ action: { not: { endsWith: suffix } } })),
    ],
  };

  const grouped = await prisma.auditLog.groupBy({
    by: ["action"],
    where: baseWhere,
    _count: { _all: true },
  });

  // Category and search are resolved per distinct action code, then pushed to the DB as
  // an `action IN (...)` list. That way the search also matches the Portuguese titles
  // ("instalada", "compra"), which never appear in the raw action column.
  const actionInfo = grouped
    .filter((g) => !isHiddenAction(g.action))
    .map((g) => {
      const category = categorizeAction(g.action);
      const copy = formatActivityDetails(g.action, null);
      const haystack = `${g.action} ${copy.title} ${copy.description} ${CATEGORY_LABELS[category]}`.toLowerCase();
      return { action: g.action, category, count: g._count._all, matchesText: q ? haystack.includes(q) : true };
    });

  const textMatchedActions = actionInfo.filter((a) => a.matchesText).map((a) => a.action);
  const searchWhere = q
    ? {
        OR: [
          { action: { in: textMatchedActions } },
          { detailsJson: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  // With a search term, counts come from the DB because detailsJson matches can hit
  // actions whose title does not contain the term.
  const countsByCategory = new Map<ActivityCategory, number>();
  if (q) {
    const searchGrouped = await prisma.auditLog.groupBy({
      by: ["action"],
      where: { ...baseWhere, ...searchWhere },
      _count: { _all: true },
    });
    for (const g of searchGrouped) {
      if (isHiddenAction(g.action)) continue;
      const cat = categorizeAction(g.action);
      countsByCategory.set(cat, (countsByCategory.get(cat) ?? 0) + g._count._all);
    }
  } else {
    for (const a of actionInfo) {
      countsByCategory.set(a.category, (countsByCategory.get(a.category) ?? 0) + a.count);
    }
  }

  const totalAll = [...countsByCategory.values()].reduce((s, n) => s + n, 0);
  const categories: ActivityCategorySummary[] = [
    { id: "all", label: CATEGORY_LABELS.all, count: totalAll },
    ...CATEGORY_ORDER.filter((id) => (countsByCategory.get(id) ?? 0) > 0).map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      count: countsByCategory.get(id) ?? 0,
    })),
  ];
  const categoryCounts: Record<string, number> = Object.fromEntries(categories.map((c) => [c.id, c.count]));

  const categoryActions =
    categoryFilter === "all"
      ? null
      : actionInfo.filter((a) => a.category === categoryFilter).map((a) => a.action);

  const listWhere = {
    ...baseWhere,
    ...searchWhere,
    ...(categoryActions ? { action: { in: categoryActions } } : {}),
  };

  const total = categoryFilter === "all" ? totalAll : countsByCategory.get(categoryFilter) ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows =
    total === 0
      ? []
      : await prisma.auditLog.findMany({
          where: listWhere,
          select: {
            id: true,
            action: true,
            label: true,
            description: true,
            detailsJson: true,
            ip: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        });

  const logs: FormattedUserActivityItem[] = rows.map((log) => {
    const category = categorizeAction(log.action);
    const { title, description, details } = formatActivityDetails(
      log.action,
      log.detailsJson,
      log.label,
      log.description,
    );
    return {
      id: log.id,
      action: log.action,
      category,
      categoryLabel: CATEGORY_LABELS[category],
      title,
      description,
      details,
      ip: maskIp(log.ip),
      createdAt: log.createdAt.toISOString(),
    };
  });

  return {
    ok: true,
    logs,
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page < totalPages,
    categories,
    categoryCounts,
    windowDays,
  };
}
