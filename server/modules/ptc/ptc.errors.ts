/**
 * Ported from the exact `Error.message` strings legacy/server/modules/ptc/application/ptc.service.ts
 * throws — callers match on message, same convention as shop.errors.ts.
 */
export const PTC_ERROR_MESSAGE = {
  DISABLED: "PTC system is currently disabled",
  TIER_UNAVAILABLE: "Selected option is not available",
  TIER_NOT_FOUND: "Tier not found",
  VIEWS_OUT_OF_RANGE: "Views must be between %min and %max",
  INSUFFICIENT_BALANCE: "Insufficient SHIB balance",
  USER_NOT_FOUND: "User not found",
  CAMPAIGN_NOT_FOUND: "Campaign not found",
  CAMPAIGN_LOCKED: "Cannot edit a completed or rejected campaign",
  CAMPAIGN_LOCKED_VIEWS_ADD: "Cannot add views to a completed or rejected campaign",
  CAMPAIGN_LOCKED_VIEWS_REMOVE: "Cannot modify a completed or rejected campaign",
  MAX_VIEWS_EXCEEDED: "Max views is %max",
  MIN_VIEWS_VIOLATED: "Min views is %min",
  BELOW_DELIVERED_VIEWS: "Cannot reduce below delivered views (%delivered)",
  NOT_PENDING_APPROVAL: "Campaign is not pending approval",
  SESSION_ALREADY_ACTIVE: "Você já possui um anúncio ativo. Conclua-o antes de iniciar outro.",
  AD_UNAVAILABLE: "Anúncio não disponível",
  CANNOT_VIEW_OWN_AD: "Você não pode visualizar seu próprio anúncio",
  ALREADY_VIEWED_TODAY: "Você já visualizou este anúncio hoje (UTC). Volte após o reset diário às 00:00 UTC.",
  SESSION_NOT_FOUND: "Sessão não encontrada",
  SESSION_ALREADY_CLAIMED: "Sessão já foi resgatada",
  SESSION_CANCELLED: "Sessão cancelada",
  SESSION_REWARD_ALREADY_CLAIMED: "Recompensa já foi resgatada",
  SESSION_CANCELLED_RESTART: "Sessão cancelada — reinicie o anúncio",
  SESSION_EXPIRED: "Sessão expirada por inatividade — reinicie o anúncio",
  SESSION_NOT_COMPLETE: "Tempo de visualização ainda não concluído",
  VIEW_ALREADY_RECORDED: "Visualização já registrada",
  AD_NO_LONGER_AVAILABLE: "Anúncio não está mais disponível",
} as const;

export class PtcRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PtcRejectedError";
  }
}
