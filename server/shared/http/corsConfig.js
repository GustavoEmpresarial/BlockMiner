import { logger } from "../../core/logger/index.js";
const corsLog = logger.child("Cors");
/** Partner / sibling frontends always allowed (merged with CORS_ORIGINS). */
export const BUILTIN_CORS_ORIGINS = [
    "https://blockminer.space",
    "https://www.blockminer.space",
    "https://dev.blockminer.space",
    "https://support.blockminer.space",
    "https://genesisdao.tech",
    "https://www.genesisdao.tech",
    "https://minercore.online",
    "https://www.minercore.online",
    "https://dev.minercore.online",
    "http://dev.minercore.online",
];
export function parseCorsOriginsList() {
    const raw = process.env.CORS_ORIGINS;
    const fromEnv = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    return [...new Set([...fromEnv, ...BUILTIN_CORS_ORIGINS])];
}
export function assertProductionCorsConfigured() {
    if (process.env.NODE_ENV === "production" && parseCorsOriginsList().length === 0) {
        throw new Error("CORS_ORIGINS is required in production (comma-separated origins, e.g. https://blockminer.space).");
    }
}
/** Express cors() options — rejects unknown origins without throwing (no 500 on bots). */
export function buildExpressCorsOptions() {
    assertProductionCorsConfigured();
    const origins = parseCorsOriginsList();
    return {
        origin(origin, callback) {
            if (origins.length === 0) {
                callback(null, true);
                return;
            }
            if (!origin) {
                callback(null, true);
                return;
            }
            if (origins.includes(origin)) {
                callback(null, true);
                return;
            }
            corsLog.warn("cors.origin_rejected", {
                origin,
                path: "(preflight or api)",
                allowedCount: origins.length,
            });
            callback(null, false);
        },
        credentials: true,
    };
}
/** Socket.IO v4 cors option shape. */
export function buildSocketIoCorsOptions() {
    assertProductionCorsConfigured();
    const origins = parseCorsOriginsList();
    return {
        origin: origins.length ? origins : true,
        methods: ["GET", "POST"],
        credentials: true,
    };
}
