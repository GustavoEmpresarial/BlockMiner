/** Shared pure helpers for proxy-provider response parsing. */
export function asBool(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}
export function sliceString(value, max = 255) {
    const s = String(value || "").trim();
    return s ? s.slice(0, max) : null;
}
export function parseAsn(value) {
    const match = String(value ?? "").trim().match(/AS?(\d+)/i);
    if (!match) {
        const n = Number(String(value ?? "").trim());
        return Number.isInteger(n) && n > 0 ? n : null;
    }
    const n = Number(match[1]);
    return Number.isInteger(n) && n > 0 ? n : null;
}
export function parseRiskScore(value) {
    const n = Number(String(value ?? "").trim());
    if (!Number.isFinite(n))
        return null;
    return Math.max(0, Math.min(100, Math.round(n)));
}
/** Map vpn/proxy/tor/relay flags to PROXY_TYPE_PRIORITY order. */
export function typeFromFlags(flags) {
    if (flags.tor)
        return "tor";
    if (flags.vpn)
        return "vpn";
    if (flags.proxy)
        return "proxy";
    if (flags.relay)
        return "relay";
    return null;
}
