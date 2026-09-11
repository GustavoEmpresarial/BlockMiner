/** Lower weight = more severe. SECURITY shares ERROR weight so it is never filtered by `error`. */
export const LOG_LEVEL_WEIGHT = {
    ERROR: 0,
    SECURITY: 0,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
};
export const DEFAULT_LOG_LEVEL = "INFO";
export function parseLogLevel(raw) {
    const normalized = String(raw ?? DEFAULT_LOG_LEVEL).trim().toUpperCase();
    if (normalized in LOG_LEVEL_WEIGHT)
        return normalized;
    return DEFAULT_LOG_LEVEL;
}
export function parseLogLevelThreshold(raw) {
    return LOG_LEVEL_WEIGHT[parseLogLevel(raw)];
}
export function isLogLevelAllowed(level, threshold) {
    return LOG_LEVEL_WEIGHT[level] <= threshold;
}
export function normalizeLogDetails(details) {
    if (details == null)
        return {};
    if (typeof details !== "object" || Array.isArray(details))
        return { value: details };
    return { ...details };
}
export function requestContextFromReq(req) {
    if (!req || typeof req !== "object")
        return {};
    const userId = req.user?.id != null ? String(req.user.id) : undefined;
    const requestId = (typeof req.headers?.["x-request-id"] === "string" ? req.headers["x-request-id"] : undefined) ??
        undefined;
    return {
        ...(userId ? { userId } : {}),
        ip: req.ip,
        endpoint: String(req.originalUrl || req.url || ""),
        ...(requestId ? { requestId } : {}),
    };
}
export function buildLogRecord(input) {
    const details = normalizeLogDetails(input.details);
    return {
        level: input.level.toLowerCase(),
        message: input.message,
        category: input.category,
        timestamp: (input.now ?? new Date()).toISOString(),
        ...requestContextFromReq(input.req),
        ...(Object.keys(details).length ? { details } : {}),
    };
}
function writeLine(record) {
    if (process.env.NODE_ENV === "test")
        return;
    // eslint-disable-next-line no-console
    console.info(JSON.stringify(record));
}
export class Logger {
    category;
    threshold;
    constructor(category = "App", threshold = parseLogLevelThreshold(process.env.LOG_LEVEL)) {
        this.category = category;
        this.threshold = threshold;
    }
    child(category) {
        return new Logger(`${this.category}:${category}`, this.threshold);
    }
    emit(level, message, details = {}, req) {
        if (!isLogLevelAllowed(level, this.threshold))
            return;
        writeLine(buildLogRecord({
            level,
            message,
            category: this.category,
            details,
            req,
        }));
    }
    error(message, details, req) {
        this.emit("ERROR", message, details, req);
    }
    security(message, details, req) {
        this.emit("SECURITY", message, details, req);
    }
    warn(message, details, req) {
        this.emit("WARN", message, details, req);
    }
    info(message, details, req) {
        this.emit("INFO", message, details, req);
    }
    debug(message, details, req) {
        this.emit("DEBUG", message, details, req);
    }
}
const rootLogger = new Logger("App");
export default rootLogger;
