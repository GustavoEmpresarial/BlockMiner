/**
 * Critical-mutation idempotency — ported from legacy/server/middleware/criticalIdempotency.ts
 * + legacy/server/utils/criticalMutationIdempotency.ts + services/idempotencyService.ts, merged
 * into one file (core infra, no business rules).
 *
 * Postgres-backed (no Redis): leases/results are stored as rows in `CallbackQueue`
 * (callbackType "SEC_IDEM"), guarded by a Postgres advisory lock scoped to the
 * transaction so concurrent requests with the same key never race.
 *
 * Usage in a route:
 *   router.post("/withdraw", requireAuth, requireCriticalIdempotency({ scope: "wallet_withdraw" }), controller);
 *
 * Usage in the controller:
 *   const idem = await resolveCriticalMutation(req, res);
 *   if (!idem) return; // response already sent (400/409/200-replay)
 *   try {
 *     const result = await doTheMutation();
 *     const payload = { ok: true, ...result };
 *     await finalizeCriticalMutationSuccess(idem.lease, { requestHash: idem.ci.requestHash, responseJson: payload });
 *     res.json(payload);
 *   } catch (err) {
 *     await cancelCriticalMutation(idem.lease);
 *     throw err;
 *   }
 */
import { createHash, randomBytes } from "node:crypto";
import prisma from "../../database/prisma.js";
function normalizeIdempotencyKey(key) {
    if (key == null)
        return null;
    const s = String(key).trim();
    if (!s)
        return null;
    if (s.length > 128 || s.length < 8)
        return null;
    if (!/^[0-9a-zA-Z._-]+$/.test(s))
        return null;
    return s;
}
const EPHEMERAL_BODY_KEYS = new Set(["cfTurnstileToken"]);
function sortKeysDeep(value) {
    if (value === null || value === undefined)
        return value;
    if (Array.isArray(value))
        return value.map(sortKeysDeep);
    if (typeof value !== "object")
        return value;
    const obj = value;
    const out = {};
    for (const k of Object.keys(obj).sort())
        out[k] = sortKeysDeep(obj[k]);
    return out;
}
function stableRequestHash(input) {
    const body = typeof input.body === "object" && input.body !== null
        ? { ...input.body }
        : input.body;
    if (body && typeof body === "object") {
        for (const k of EPHEMERAL_BODY_KEYS)
            delete body[k];
    }
    const normalized = JSON.stringify(sortKeysDeep({ body, params: input.params, path: input.path }));
    return createHash("sha256").update(normalized).digest("hex");
}
function buildIdempotencyErrorJson(code, extra) {
    const messages = {
        INVALID_STATE: "The resource is not in a valid state for this action.",
        RACE_CONDITION_DETECTED: "This action conflicted with another request. Refresh the page and try again.",
        IDEMPOTENT_REPLAY: "This request was already processed; returning the previous result.",
        INVALID_REQUEST_SIGNATURE: "The idempotency key does not match this request payload. Use a new key for a different action.",
    };
    return { ok: false, code, message: messages[code] || "Request could not be completed.", ...(extra ? { details: extra } : {}) };
}
export function requireCriticalIdempotency(opts) {
    const scope = String(opts.scope || "critical");
    return function criticalIdempotency(req, res, next) {
        const raw = req.get("Idempotency-Key") || req.get("idempotency-key") || req.body?.idempotencyKey;
        const idempotencyKey = normalizeIdempotencyKey(raw);
        if (!idempotencyKey) {
            res.status(400).json(buildIdempotencyErrorJson("INVALID_STATE", { field: "idempotencyKey" }));
            return;
        }
        const requestHash = stableRequestHash({ body: req.body, params: req.params, path: req.path });
        req.criticalIdempotency = { scope, idempotencyKey, requestHash };
        next();
    };
}
function callbackQueue(client) {
    return client.callbackQueue;
}
function logicalHash(scope, userId, idempotencyKey) {
    return createHash("sha256").update(`${scope}|${userId}|${idempotencyKey}`, "utf8").digest("hex");
}
const CLAIM_TTL_SEC = 120;
const RESULT_TTL_SEC = 86_400;
export async function resolveCriticalMutation(req, res) {
    const ci = req.criticalIdempotency;
    if (!ci?.scope || !ci.idempotencyKey || !ci.requestHash) {
        res.status(500).json({ ok: false, message: "Idempotency middleware is not configured for this route." });
        return null;
    }
    if (req.user == null) {
        res.status(401).json({ ok: false, message: "Unauthorized." });
        return null;
    }
    const userId = req.user.id;
    const h = logicalHash(ci.scope, userId, ci.idempotencyKey);
    const now = Date.now();
    const phase = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `idem:${h}`);
        const cbq = callbackQueue(tx);
        const row = await cbq.findFirst({ where: { callbackType: "SEC_IDEM", callbackHash: h } });
        const data = (row?.data && typeof row.data === "object" ? row.data : {});
        if (data.phase === "done" && data.responseJson != null) {
            if (data.requestHash !== ci.requestHash)
                return { type: "mismatch" };
            return { type: "replay", responseJson: data.responseJson };
        }
        if (data.phase === "lease" && Number(data.leaseUntilMs ?? 0) > now) {
            if (data.requestHash != null && data.requestHash !== ci.requestHash)
                return { type: "mismatch" };
            return { type: "busy" };
        }
        const leaseToken = randomBytes(16).toString("hex");
        const leaseUntilMs = now + CLAIM_TTL_SEC * 1000;
        const payload = { v: 1, phase: "lease", requestHash: ci.requestHash, leaseToken, leaseUntilMs };
        if (row?.id) {
            await cbq.update({ where: { id: row.id }, data: { data: payload, processedAt: new Date() } });
        }
        else {
            await cbq.create({
                data: { callbackType: "SEC_IDEM", callbackHash: h, userId, data: payload, status: "processed", processedAt: new Date() },
            });
        }
        return { type: "lease", leaseToken, h, resultTtlSec: RESULT_TTL_SEC, requestHash: ci.requestHash };
    });
    if (phase.type === "mismatch") {
        res.status(400).json(buildIdempotencyErrorJson("INVALID_REQUEST_SIGNATURE"));
        return null;
    }
    if (phase.type === "busy") {
        res.status(409).json(buildIdempotencyErrorJson("RACE_CONDITION_DETECTED", { reason: "IDEMPOTENCY_IN_FLIGHT" }));
        return null;
    }
    if (phase.type === "replay") {
        res.status(200).json(phase.responseJson);
        return null;
    }
    return { lease: phase, ci };
}
export async function finalizeCriticalMutationSuccess(lease, payload) {
    const cbq = callbackQueue(prisma);
    const row = await cbq.findFirst({ where: { callbackType: "SEC_IDEM", callbackHash: lease.h } });
    const data = { v: 1, phase: "done", requestHash: payload.requestHash, responseJson: payload.responseJson };
    if (row?.id) {
        await cbq.update({ where: { id: row.id }, data: { data, processedAt: new Date() } });
    }
}
export async function cancelCriticalMutation(lease) {
    if (!lease)
        return;
    const cbq = callbackQueue(prisma);
    const row = await cbq.findFirst({ where: { callbackType: "SEC_IDEM", callbackHash: lease.h } });
    if (row?.id) {
        await cbq.update({ where: { id: row.id }, data: { status: "cancelled", processedAt: new Date() } });
    }
}
