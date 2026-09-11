/**
 * Socket.IO handshake auth middleware. Ported from
 * legacy/server/utils/socketHandshakeAuthPolicy.ts.
 *
 * Validates an optional `handshake.auth.token` sent by clients. An empty/absent token means
 * "no explicit auth" — the connection is still allowed (per-event handlers, e.g. `miner:join`,
 * `support:subscribe`, do their own real auth against cookies/bearer token). Only an explicit,
 * syntactically-JWT-shaped but invalid/expired token is rejected outright.
 */
import type { Server, Socket } from "socket.io";
import type { JwtPayload } from "jsonwebtoken";
import { verifyAccessToken } from "../../shared/security/authTokens.js";

export type HandshakeTokenResult =
  | { kind: "skip" }
  | { kind: "reject"; message: string }
  | { kind: "ok"; userId: number };

export function evaluateExplicitSocketHandshakeToken(raw: unknown): HandshakeTokenResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { kind: "skip" };
  }
  const t = raw.trim();
  if (t.split(".").length !== 3) {
    return { kind: "reject", message: "Unauthorized" };
  }
  let payload: JwtPayload | string | null = null;
  try {
    payload = verifyAccessToken(t);
  } catch {
    payload = null;
  }
  const userId = Number(payload && typeof payload !== "string" ? payload.sub : NaN);
  if (!userId) {
    return { kind: "reject", message: "Unauthorized" };
  }
  return { kind: "ok", userId };
}

declare module "socket.io" {
  interface SocketData {
    handshakeAuthUserId?: number;
    minerId?: string;
    userId?: number;
  }
}

/**
 * Rejects connections that send an explicit invalid JWT in `handshake.auth.token`.
 * A missing/empty token is allowed through — event handlers gate per-action auth themselves.
 */
export function attachSocketIoExplicitAuthMiddleware(io: Server): void {
  io.use((socket: Socket, next) => {
    try {
      const raw = socket.handshake.auth?.token;
      const result = evaluateExplicitSocketHandshakeToken(raw);
      if (result.kind === "skip") {
        next();
        return;
      }
      if (result.kind === "reject") {
        next(new Error(result.message));
        return;
      }
      socket.data.handshakeAuthUserId = result.userId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
}
