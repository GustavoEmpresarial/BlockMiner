// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
function formatZodError(error) {
    return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}
function deriveCodeFromZodFirstMessage(message) {
    if (typeof message !== "string")
        return undefined;
    const prefix = "auth.register.errors.";
    if (message.startsWith(prefix)) {
        const tail = message.slice(prefix.length).replace(/[^a-z0-9_]/gi, "_");
        return tail ? tail.toUpperCase() : undefined;
    }
    return undefined;
}
export function validateBody(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body ?? {});
        if (!result.success) {
            const errors = formatZodError(result.error);
            const code = deriveCodeFromZodFirstMessage(errors[0]?.message);
            res.status(400).json({ ok: false, message: "Invalid request data.", errors, ...(code ? { code } : {}) });
            return;
        }
        req.body = result.data;
        next();
    };
}
export function validateQuery(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.query || {});
        if (!result.success) {
            res.status(400).json({ ok: false, message: "Invalid query data.", errors: formatZodError(result.error) });
            return;
        }
        req.query = result.data;
        next();
    };
}
export function validateParams(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.params || {});
        if (!result.success) {
            res.status(400).json({ ok: false, message: "Invalid route parameters.", errors: formatZodError(result.error) });
            return;
        }
        req.params = result.data;
        next();
    };
}
