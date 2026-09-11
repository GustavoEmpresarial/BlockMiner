/**
 * Public-safe user payload for JSON responses (login, register, session).
 * Never add password hashes, tokens, or secrets here.
 */
export type AuthPublicUserDto = {
  id: number;
  name: string;
  username: string | null;
  email: string;
  hasReferral?: boolean;
  energyHasPendingTax?: boolean;
  /** item 95 Parte B — false só pra contas criadas após o deploy da verificação de email. */
  emailVerified?: boolean;
  /** item 97 — código de indicação PÚBLICO por design (é literalmente o que vai na URL
   *  compartilhada). Não é segredo — nunca use pra identificar/autenticar o usuário. */
  refCode?: string | null;
};
