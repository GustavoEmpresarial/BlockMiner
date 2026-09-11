import { logger as rootLogger } from "../../core/logger/index.js";
import { getAuthUserById } from "../../shared/security/authUser.js";
import { verifyAccessToken } from "../../shared/security/authTokens.js";
import { getTokenFromRequest } from "../../shared/security/token.js";
import { isTokenSessionCurrent } from "../../shared/security/sessionVersion.js";
import { sanitizePublicStateForSocket } from "../../core/socket/socket.sanitize.js";
import { engine, getOrCreateEngineMinerForUser, applyBoostForUser, upgradeRigForUser } from "./mining.service.js";
const logger = rootLogger.child("MiningSocket");
function safeSocketPublicState(minerId) {
    if (!minerId)
        return null;
    const raw = engine.getPublicState(minerId);
    return sanitizePublicStateForSocket(raw) ?? raw;
}
function asRecord(payload) {
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}
export function registerMiningSocketHandlers(io) {
    io.on("connection", (socket) => {
        socket.on("miner:join", async (payload, callback) => {
            try {
                const p = asRecord(payload);
                const tokenRaw = p.token;
                const explicitToken = typeof tokenRaw === "string" && tokenRaw.split(".").length === 3 ? tokenRaw : null;
                const requestLike = { headers: (socket.request?.headers || {}) };
                const authToken = explicitToken || getTokenFromRequest(requestLike);
                if (!authToken) {
                    socket.emit("auth:expired");
                    callback?.({ ok: false, code: "AUTH_EXPIRED", message: "Sessão inválida. Faça login novamente." });
                    return;
                }
                let jwtPayload = null;
                try {
                    jwtPayload = verifyAccessToken(authToken);
                }
                catch {
                    jwtPayload = null;
                }
                const userId = Number(jwtPayload && typeof jwtPayload !== "string" ? jwtPayload.sub : NaN);
                if (!userId) {
                    socket.emit("auth:expired");
                    callback?.({ ok: false, code: "AUTH_EXPIRED", message: "Sessão inválida. Faça login novamente." });
                    return;
                }
                const user = await getAuthUserById(userId);
                if (!user) {
                    socket.emit("auth:expired");
                    callback?.({ ok: false, code: "AUTH_EXPIRED", message: "Sessão inválida. Faça login novamente." });
                    return;
                }
                if (!isTokenSessionCurrent(jwtPayload, user.sessionVersion)) {
                    socket.emit("auth:expired", { code: "SESSION_SUPERSEDED" });
                    callback?.({ ok: false, code: "SESSION_SUPERSEDED", message: "Sessão encerrada — login detectado em outro dispositivo." });
                    return;
                }
                const miner = await getOrCreateEngineMinerForUser(user.id);
                engine.setConnected(miner.id, true);
                socket.data.minerId = miner.id;
                socket.data.userId = user.id;
                socket.join(`user:${user.id}`);
                const safeState = safeSocketPublicState(miner.id);
                if (!safeState) {
                    callback?.({ ok: false, message: "Estado inválido. Atualize a página." });
                    return;
                }
                callback?.({ ok: true, minerId: miner.id, state: safeState });
            }
            catch (error) {
                logger.error("miner:join failed", { error: error instanceof Error ? error.message : String(error) });
                callback?.({ ok: false, message: "Não foi possível carregar sua sala de mineração." });
            }
        });
        socket.on("miner:toggle", (payload, callback) => {
            const p = asRecord(payload);
            const active = Boolean(p.active);
            const minerId = socket.data.minerId;
            if (!minerId) {
                callback?.({ ok: false, message: "Conecte-se primeiro." });
                return;
            }
            engine.setActive(minerId, active);
            callback?.({ ok: true, state: safeSocketPublicState(minerId) });
        });
        socket.on("miner:boost", async (_payload, callback) => {
            const minerId = socket.data.minerId;
            const userId = socket.data.userId;
            if (!minerId || !userId) {
                callback?.({ ok: false, message: "Conecte-se primeiro." });
                return;
            }
            const result = await applyBoostForUser(userId);
            callback?.({ ...result, state: safeSocketPublicState(minerId) });
        });
        socket.on("miner:upgrade-rig", async (_payload, callback) => {
            const minerId = socket.data.minerId;
            const userId = socket.data.userId;
            if (!minerId || !userId) {
                callback?.({ ok: false, message: "Conecte-se primeiro." });
                return;
            }
            const result = await upgradeRigForUser(userId);
            callback?.({ ...result, state: safeSocketPublicState(minerId) });
        });
        socket.on("disconnect", () => {
            const minerId = socket.data.minerId;
            if (minerId) {
                engine.setConnected(minerId, false);
            }
        });
    });
}
