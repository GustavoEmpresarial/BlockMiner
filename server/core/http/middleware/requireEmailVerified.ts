/**
 * item 95 Parte B (pentest blockminer.space) — gate pra ações sensíveis que exigem email
 * confirmado. Deve rodar DEPOIS de `requireAuth` (usa `req.user`, já populado por ele — sem
 * query extra, `emailVerifiedAt` já vem no select do auth cache).
 *
 * Escopo deliberadamente contido: só withdraw e chat (send/send-private) nesta primeira
 * rodada — não trava mineração/jogos/faucet, que são a experiência central do produto.
 * Usuários criados ANTES deste deploy foram backfillados (emailVerifiedAt = createdAt) e
 * nunca são bloqueados por este gate.
 */
import type { NextFunction, Request, Response } from "express";

export function requireEmailVerified(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    // Não deveria acontecer se montado depois de requireAuth, mas não assume — falha fechado.
    res.status(401).json({ ok: false, message: "Session invalid.", code: "ACCESS_MISSING" });
    return;
  }
  if (!user.emailVerifiedAt) {
    res.status(403).json({
      ok: false,
      code: "EMAIL_NOT_VERIFIED",
      message: "Confirme seu e-mail para usar este recurso.",
    });
    return;
  }
  next();
}
