// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * JWT access-token signing/verification and opaque refresh-token
 * generation/parsing. Ported from legacy/server/utils/authTokens.ts.
 */
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "12h";
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
export const JWT_ISSUER = process.env.JWT_ISSUER || "blockminer";
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "blockminer.app";
// Pinned explicitly (2026-09-11 hardening pass): jsonwebtoken's verify() infers the
// algorithm from the token's own header when `algorithms` is omitted — an attacker-supplied
// token picks which HMAC variant gets checked against the same secret instead of the server
// deciding. Harmless here in practice (single symmetric secret, no RS/ES keypair to confuse
// with), but pinning the exact algorithm on both sign and verify is the OWASP-recommended
// baseline and costs nothing.
const JWT_ALGORITHM = "HS256";
function requireJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET is required. Please set it in your .env file.");
    return secret;
}
export function signAccessToken(user) {
    const payload = {
        sub: String(user.id),
        name: user.name ?? undefined,
        email: user.email ?? undefined,
        sv: user.sessionVersion ?? undefined,
    };
    const signOptions = {
        algorithm: JWT_ALGORITHM,
        expiresIn: ACCESS_TOKEN_TTL,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
    };
    return jwt.sign(payload, requireJwtSecret(), signOptions);
}
export function verifyAccessToken(token) {
    try {
        return jwt.verify(token, requireJwtSecret(), {
            algorithms: [JWT_ALGORITHM],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });
    }
    catch {
        return null;
    }
}
function hashRefreshSecret(secret) {
    return crypto.createHash("sha256").update(secret).digest("hex");
}
export function createRefreshToken() {
    const tokenId = crypto.randomUUID();
    const secret = crypto.randomBytes(48).toString("hex");
    const token = `${tokenId}.${secret}`;
    const expiresAt = Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
    return { token, tokenId, tokenHash: hashRefreshSecret(secret), expiresAt };
}
export function parseRefreshToken(rawToken) {
    if (!rawToken || typeof rawToken !== "string")
        return null;
    const parts = rawToken.split(".");
    if (parts.length !== 2)
        return null;
    const [tokenId, secret] = parts;
    if (!tokenId || !secret)
        return null;
    return { tokenId, secret, tokenHash: hashRefreshSecret(secret) };
}
export { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_DAYS };
