/** Thrown inside transactions/handlers to map to HTTP status in catch blocks. */
export class HttpStatusError extends Error {
    http;
    code;
    vaultSlot;
    constructor(http, message, options) {
        super(message);
        this.name = "HttpStatusError";
        this.http = http;
        this.code = options?.code;
        this.vaultSlot = options?.vaultSlot;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export function readHttpStatus(err) {
    if (err instanceof HttpStatusError)
        return err.http;
    if (typeof err === "object" && err !== null && "http" in err) {
        const h = err.http;
        return typeof h === "number" ? h : undefined;
    }
    return undefined;
}
export function readErrorCode(err) {
    if (err instanceof HttpStatusError && err.code)
        return err.code;
    if (typeof err === "object" && err !== null && "code" in err) {
        const c = err.code;
        return typeof c === "string" ? c : undefined;
    }
    return undefined;
}
export function readErrorMessage(err) {
    return err instanceof Error ? err.message : "Unexpected error";
}
export function readVaultSlot(err) {
    if (err instanceof HttpStatusError && typeof err.vaultSlot === "number")
        return err.vaultSlot;
    if (typeof err === "object" && err !== null && "vaultSlot" in err) {
        const v = err.vaultSlot;
        return typeof v === "number" ? v : undefined;
    }
    return undefined;
}
/**
 * Pulls the authenticated user off `req` and writes a 401 JSON body when
 * absent. Controllers call this at the top instead of relying on `next()`.
 */
export function requireSessionUser(req, res) {
    const u = req.user;
    if (u == null) {
        res.status(401).json({ ok: false, message: "Unauthorized." });
        return null;
    }
    return u;
}
export function jsonClientError(res, status, code, i18nKey, message) {
    res.status(status).json({
        ok: false,
        code,
        i18nKey,
        message: message || code,
    });
}
