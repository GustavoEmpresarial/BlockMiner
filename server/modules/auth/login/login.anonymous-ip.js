import { invalidateAuthUserCache } from "../../../shared/security/authUser.js";
import { applyAnonymousSessionEviction } from "./login.anonymous-evict.js";
import { authBlockVpnProxy, evaluateAnonymousIp, getCachedIpIntelligence, getClientIpFromResolver, } from "../../ip-intelligence/index.js";
export function loginClientIp(req) {
    return getClientIpFromResolver(req) || String(req.ip || "");
}
export async function inspectAnonymousLoginIp(prisma, ip) {
    if (!authBlockVpnProxy()) {
        return { blocked: false, reason: null, proxySource: null, asn: null, proxyDetected: null };
    }
    const intel = await getCachedIpIntelligence(prisma, ip).catch(() => null);
    const verdict = evaluateAnonymousIp(intel);
    return {
        ...verdict,
        proxySource: intel?.proxySource ?? null,
        asn: intel?.asn ?? null,
        proxyDetected: intel?.proxyDetected ?? null,
    };
}
export { applyAnonymousSessionEviction } from "./login.anonymous-evict.js";
/** Inspect current IP; if anonymous, evict the session. */
export async function evictIfAnonymousNetwork(prisma, userId, ip) {
    const verdict = await inspectAnonymousLoginIp(prisma, ip);
    if (verdict.blocked) {
        await applyAnonymousSessionEviction(prisma, userId, invalidateAuthUserCache);
    }
    return verdict;
}
