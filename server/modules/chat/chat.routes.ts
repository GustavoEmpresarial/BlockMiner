// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { requireEmailVerified } from "../../core/http/middleware/requireEmailVerified.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as chatController from "./chat.controller.js";
export const chatRouter = express.Router();
const chatLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });
// item 100 (pentest achado #3): PM é vetor de assédio direto a UM usuário — 30/min era o
// mesmo teto do chat público (onde a mensagem se dilui entre todo mundo). Apertado pra
// send-private especificamente, sem mexer no limite do chat público.
const privateChatLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
chatRouter.get("/messages", requireAuth, chatController.getMessages);
chatRouter.get("/users", requireAuth, chatController.getActiveUsers);
// item 95 Parte B: send/send-private exigem email confirmado — mitiga farming/spam por
// contas descartáveis (o próprio pentest citou registro sem verificação como vetor).
chatRouter.post("/send", requireAuth, requireEmailVerified, chatLimiter, chatController.sendMessage);
chatRouter.get("/private/:targetUserId", requireAuth, chatController.getPrivateMessages);
chatRouter.post("/send-private", requireAuth, requireEmailVerified, privateChatLimiter, chatController.sendPrivateMessage);
chatRouter.get("/conversations", requireAuth, chatController.getConversations);
