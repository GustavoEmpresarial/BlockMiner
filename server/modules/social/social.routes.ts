import { Router } from "express";
import { requireAuth, authenticateTokenOptional } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as social from "./social.controller.js";
export const socialRouter = Router();
const voteRateLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 30,
    message: "Muitos votos em pouco tempo. Aguarde um instante.",
});
const profileUpdateLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 10,
    message: "Muitas edições seguidas. Tente novamente em instantes.",
});
// item 95 (pentest A3): faltava — era a única rota de upload sem rate limit (comparar com
// supportUploadLimiter em support.routes.ts, mesma janela/limite).
const socialUploadLimiter = createRateLimiter({
    windowMs: 15 * 60_000,
    max: 30,
    message: "Muitos uploads em pouco tempo. Tente novamente em instantes.",
});
// item 96 (pentest A9): /submit e /request-credential eram as duas únicas rotas de escrita do
// módulo sem rate limit — e cada /submit dispara DOIS avisos no Telegram (linha do outbox +
// envio direto pelo bot de vídeos), então um creator credenciado em loop inundava o canal de
// moderação. Janelas/limites no espírito dos limiters vizinhos, apertados porque submissão de
// vídeo e pedido de credencial são ações raras por natureza.
const videoSubmitLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 5,
    message: "Muitos envios de vídeo em pouco tempo. Aguarde um instante.",
});
const credentialRequestLimiter = createRateLimiter({
    windowMs: 15 * 60_000,
    max: 5,
    message: "Muitas solicitações de credenciamento. Tente novamente em instantes.",
});
socialRouter.get("/feed", authenticateTokenOptional, social.getPublicFeed);
socialRouter.get("/my-profile", requireAuth, social.getMyProfile);
socialRouter.get("/my-submissions", requireAuth, social.getMySubmissions);
socialRouter.post("/submit", requireAuth, videoSubmitLimiter, social.submitVideo);
socialRouter.post("/request-credential", requireAuth, credentialRequestLimiter, social.requestCredential);
socialRouter.put("/my-profile", requireAuth, profileUpdateLimiter, social.updateMyProfile);
socialRouter.post("/videos/:id/vote", requireAuth, voteRateLimiter, social.voteVideo);
socialRouter.post("/upload-photo", requireAuth, socialUploadLimiter, social.uploadChannelPhoto);
