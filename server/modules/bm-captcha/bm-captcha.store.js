const chalMem = new Map();
const passMem = new Map();
const mintMem = new Map();
let sweepTimer = null;
function ensureSweep() {
    if (sweepTimer)
        return;
    sweepTimer = setInterval(() => {
        const now = Date.now();
        for (const [k, v] of chalMem)
            if (v.exp <= now)
                chalMem.delete(k);
        for (const [k, v] of passMem)
            if (v.exp <= now)
                passMem.delete(k);
        for (const [k, v] of mintMem)
            if (v.resetAt <= now)
                mintMem.delete(k);
    }, 30_000);
    if (typeof sweepTimer === "object" && sweepTimer && "unref" in sweepTimer) {
        sweepTimer.unref();
    }
}
export async function saveChallenge(rec, ttlMs) {
    ensureSweep();
    void ttlMs;
    chalMem.set(rec.challengeId, { exp: rec.expiresAt, raw: JSON.stringify(rec) });
}
export async function loadChallenge(id) {
    const hit = chalMem.get(id);
    if (!hit)
        return null;
    if (hit.exp <= Date.now()) {
        chalMem.delete(id);
        return null;
    }
    return JSON.parse(hit.raw);
}
export async function updateChallenge(rec) {
    await saveChallenge(rec, Math.max(1, rec.expiresAt - Date.now()));
}
export async function deleteChallenge(id) {
    chalMem.delete(id);
}
export async function savePass(rec, ttlMs) {
    ensureSweep();
    void ttlMs;
    passMem.set(rec.passId, { exp: rec.expiresAt, raw: JSON.stringify(rec) });
}
export async function loadPass(id) {
    const hit = passMem.get(id);
    if (!hit)
        return null;
    if (hit.exp <= Date.now()) {
        passMem.delete(id);
        return null;
    }
    return JSON.parse(hit.raw);
}
export async function updatePass(rec) {
    await savePass(rec, Math.max(1, rec.expiresAt - Date.now()));
}
export async function tryConsumeMintQuota(userId, max, windowMs) {
    ensureSweep();
    const key = `bmc:mint:${userId}`;
    const now = Date.now();
    let row = mintMem.get(key);
    if (!row || row.resetAt <= now) {
        row = { count: 0, resetAt: now + windowMs };
        mintMem.set(key, row);
    }
    row.count += 1;
    return row.count <= max;
}
