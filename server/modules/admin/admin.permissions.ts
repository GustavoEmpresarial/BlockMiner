/**
 * Admin RBAC roles and permissions system.
 */

export const ADMIN_ROLES = ["super_admin", "admin", "moderator", "finance", "support", "readonly"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_DEFAULT_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: ["*"],
  admin: [
    "dashboard",
    "users",
    "miners",
    "inventory",
    "store",
    "payments",
    "withdrawals",
    "deposits",
    "support",
    "logs",
    "monitoring",
    "promotions",
    "events",
    "offerwall",
    "ptc",
    "shortlinks",
    "checkin",
    "mining",
    "tournaments",
    "banners",
    "broadcast",
    "creators",
    "config",
    "audit",
    "admins",
  ],
  moderator: ["dashboard", "users.view", "users.ban", "support", "logs.view", "creators.view", "banners.view", "tournaments.view"],
  finance: ["dashboard", "users.view", "payments", "withdrawals", "deposits"],
  support: ["dashboard", "users.view", "support"],
  readonly: ["dashboard"],
};

export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
}

export const AVAILABLE_PERMISSIONS: PermissionDefinition[] = [
  { key: "dashboard", label: "Visão Geral & Dashboard", category: "Sistema" },
  { key: "users", label: "Gestão Completa de Usuários", category: "Usuários" },
  { key: "users.view", label: "Visualizar Usuários (Leitura)", category: "Usuários" },
  { key: "users.ban", label: "Suspender / Banir Usuários", category: "Usuários" },
  { key: "finance", label: "Métricas Financeiras", category: "Financeiro" },
  { key: "payments", label: "Visualizar Pagamentos", category: "Financeiro" },
  { key: "withdrawals", label: "Aprovar & Processar Saques", category: "Financeiro" },
  { key: "deposits", label: "Verificar Depósitos On-Chain", category: "Financeiro" },
  { key: "miners", label: "Gerenciar Mineradoras & Economia", category: "Mineração" },
  { key: "mining", label: "Motor de Mineração & Salas", category: "Mineração" },
  { key: "inventory", label: "Inventário & Racks", category: "Mineração" },
  { key: "store", label: "Loja & Ofertas Internas", category: "Monetização" },
  { key: "offerwall", label: "Offerwalls & Eventos Externos", category: "Monetização" },
  { key: "ptc", label: "Anúncios PTC & Banners", category: "Monetização" },
  { key: "shortlinks", label: "Shortlinks & Faucets", category: "Monetização" },
  { key: "checkin", label: "Marcos de Check-in", category: "Engajamento" },
  { key: "tournaments", label: "Torneios & Ligas", category: "Engajamento" },
  { key: "tournaments.view", label: "Visualizar Torneios (Leitura)", category: "Engajamento" },
  { key: "banners", label: "Gestão de Banners do Dashboard", category: "Monetização" },
  { key: "banners.view", label: "Visualizar Banners (Leitura)", category: "Monetização" },
  { key: "support", label: "Tickets & Suporte ao Usuário", category: "Suporte" },
  { key: "logs", label: "Logs de Sistema & Diagnóstico", category: "Sistema" },
  { key: "logs.view", label: "Visualizar Logs do Sistema", category: "Sistema" },
  { key: "monitoring", label: "Monitoramento & Métricas do Servidor", category: "Sistema" },
  { key: "config", label: "Configurações Gerais & Backups", category: "Sistema" },
  { key: "audit", label: "Logs de Auditoria Administrativa", category: "Administração" },
  { key: "admins", label: "Gerenciamento de Administradores", category: "Administração" },
  { key: "broadcast", label: "Notificações & Anúncios Broadcast", category: "Engajamento" },
  { key: "creators", label: "Gestão de Criadores & Social YouTube", category: "Engajamento" },
  { key: "creators.view", label: "Visualizar Criadores & Vídeos", category: "Engajamento" },
];

export function resolvePermissions(role: string, permissionsOverride?: unknown): string[] {
  const defaults = ROLE_DEFAULT_PERMISSIONS[role as AdminRole] ?? ["dashboard"];
  if (!Array.isArray(permissionsOverride) || permissionsOverride.length === 0) {
    return defaults;
  }
  return permissionsOverride.filter((p): p is string => typeof p === "string");
}

export function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes("*")) return true;
  if (permissions.includes(required)) return true;
  const moduleName = required.split(".")[0];
  return Boolean(moduleName && permissions.includes(moduleName));
}

/**
 * Middleware that gates route access based on required admin permission.
 * Accepts full permission keys (e.g. "broadcast") or wildcard ("*").
 * Also supports alternative permission fallback (e.g. "promotions").
 */
export function requireAdminPermission(...requiredPermissions: string[]) {
  return (req: any, res: any, next: any): void => {
    if (!req.admin) {
      res.status(401).json({ ok: false, message: "Acesso não autorizado." });
      return;
    }
    const userPermissions: string[] = req.admin.permissions ?? [];
    const hasAny = requiredPermissions.some((perm) => hasPermission(userPermissions, perm));
    if (!hasAny) {
      res.status(403).json({
        ok: false,
        code: "FORBIDDEN_PERMISSION",
        message: "Acesso negado: você não tem permissão para gerenciar este recurso.",
      });
      return;
    }
    next();
  };
}

