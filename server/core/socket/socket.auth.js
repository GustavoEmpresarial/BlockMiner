import { verifyAccessToken } from "../../shared/security/authTokens.js";
export function evaluateExplicitSocketHandshakeToken(raw) {
    if (typeof raw !== "string" || raw.trim() === "") {
        return { kind: "skip" };
    }
    const t = raw.trim();
    if (t.split(".").length !== 3) {
        return { kind: "reject", message: "Unauthorized" };
    }
    let payload = null;
    try {
        payload = verifyAccessToken(t);
    }
    catch {
        payload = null;
    }
    const userId = Number(payload && typeof payload !== "string" ? payload.sub : NaN);
    if (!userId) {
        return { kind: "reject", message: "Unauthorized" };
    }
    return { kind: "ok", userId };
}
/**
 * Rejects connections that send an explicit invalid JWT in `handshake.auth.token`.
 * A missing/empty token is allowed through — event handlers gate per-action auth themselves.
 */
export function attachSocketIoExplicitAuthMiddleware(io) {
    io.use((socket, next) => {
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
        }
        catch {
            next(new Error("Unauthorized"));
        }
    });
}
