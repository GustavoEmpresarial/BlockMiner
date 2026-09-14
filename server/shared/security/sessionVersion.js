export function readTokenSessionVersion(payload) {
    if (!payload || typeof payload === "string")
        return undefined;
    return payload.sv;
}
/** True when the token's embedded session version (if any) still matches the user's current one. */
export function isTokenSessionCurrent(payload, userSessionVersion) {
    const tokenSv = readTokenSessionVersion(payload);
    if (tokenSv === undefined)
        return false;
    return tokenSv === userSessionVersion;
}
