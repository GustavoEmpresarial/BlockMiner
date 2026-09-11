/**
 * Support realtime — `support:subscribe` (user) / `support:subscribeAdmin` (admin) join the
 * per-ticket room so `support.realtime.ts`'s `emitSupportReply` reaches them.
 * Ported from legacy/server/src/socket/registerSupportSocketHandlers.ts.
 */
import type { Server, Socket } from "socket.io";
import prisma from "../../core/database/prisma.js";
import { getAuthUserById } from "../../shared/security/authUser.js";
import { verifyAccessToken } from "../../shared/security/authTokens.js";
import { isTokenSessionCurrent } from "../../shared/security/sessionVersion.js";
import { getTokenFromRequest, getAdminTokenFromRequest } from "../../shared/security/token.js";
import { verifyAdminJwtToken } from "../admin/index.js";
import { setSupportIo } from "./support.realtime.js";

const joinBuckets = new Map<string, number[]>();

/** Simple sliding-window rate limit per socket remote address. */
function allowJoin(key: string, max = 60, windowMs = 60000): boolean {
  const now = Date.now();
  const arr = (joinBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) return false;
  arr.push(now);
  joinBuckets.set(key, arr);
  return true;
}

type AckCallback = ((response: Record<string, unknown>) => void) | undefined;

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

export function registerSupportSocketHandlers(io: Server): void {
  setSupportIo(io);

  io.on("connection", (socket: Socket) => {
    const remote = String(socket.handshake.address || "unknown");

    socket.on("support:subscribe", async (payload: unknown, callback: AckCallback) => {
      try {
        const p = asRecord(payload);
        const token = typeof p.token === "string" ? p.token : undefined;
        const supportMessageId = p.supportMessageId;
        if (!allowJoin(`support:u:${remote}`)) {
          callback?.({ ok: false, message: "Rate limited." });
          return;
        }
        const sid = Number(supportMessageId);
        if (!sid || Number.isNaN(sid)) {
          callback?.({ ok: false, message: "Invalid ticket." });
          return;
        }
        const explicitToken = typeof token === "string" && token.split(".").length === 3 ? token : null;
        const requestLike = { headers: (socket.request?.headers || {}) as Record<string, string | string[] | undefined> };
        const authToken = explicitToken || getTokenFromRequest(requestLike as never);
        let jwtPayload: ReturnType<typeof verifyAccessToken> | null = null;
        try {
          jwtPayload = authToken ? verifyAccessToken(authToken) : null;
        } catch {
          jwtPayload = null;
        }
        const userId = Number(jwtPayload && typeof jwtPayload !== "string" ? jwtPayload.sub : NaN);
        if (!userId) {
          callback?.({ ok: false, message: "Session invalid." });
          return;
        }
        const user = await getAuthUserById(userId);
        if (!user) {
          callback?.({ ok: false, message: "Session invalid." });
          return;
        }
        if (!isTokenSessionCurrent(jwtPayload, user.sessionVersion)) {
          callback?.({ ok: false, code: "SESSION_SUPERSEDED", message: "Sessão encerrada — login detectado em outro dispositivo." });
          return;
        }
        const ticket = await prisma.supportMessage.findUnique({
          where: { id: sid },
          select: { userId: true },
        });
        if (!ticket || ticket.userId !== userId) {
          callback?.({ ok: false, message: "Not found." });
          return;
        }
        socket.join(`support:${sid}`);
        callback?.({ ok: true });
      } catch {
        callback?.({ ok: false, message: "Unable to subscribe." });
      }
    });

    socket.on("support:subscribeAdmin", async (payload: unknown, callback: AckCallback) => {
      try {
        const p = asRecord(payload);
        const token = typeof p.token === "string" ? p.token : undefined;
        const supportMessageId = p.supportMessageId;
        if (!allowJoin(`support:a:${remote}`)) {
          callback?.({ ok: false, message: "Rate limited." });
          return;
        }
        const sid = Number(supportMessageId);
        if (!sid || Number.isNaN(sid)) {
          callback?.({ ok: false, message: "Invalid ticket." });
          return;
        }
        const explicitAdmin = typeof token === "string" && token.split(".").length === 3 ? token : null;
        const handshakeHeaders = (socket.handshake?.headers || {}) as Record<string, string | string[] | undefined>;
        const requestLike = { headers: handshakeHeaders };
        const cookieAdmin = getAdminTokenFromRequest(requestLike as never);
        const adminJwt = verifyAdminJwtToken(explicitAdmin || cookieAdmin);
        if (!adminJwt) {
          callback?.({ ok: false, message: "Admin session invalid." });
          return;
        }
        const ticket = await prisma.supportMessage.findUnique({
          where: { id: sid },
          select: { id: true },
        });
        if (!ticket) {
          callback?.({ ok: false, message: "Not found." });
          return;
        }
        socket.join(`support:${sid}`);
        callback?.({ ok: true });
      } catch {
        callback?.({ ok: false, message: "Unable to subscribe." });
      }
    });
  });
}
