/**
 * Canvas click-to-find — numbered coins (clear UX).
 * Match key = digit on the coin. Decoys always use a different digit.
 * Anti-pattern: position/layout HMAC, metal tint jitter, size/rot jitter — not cryptic shapes.
 */
import { bmCaptchaCanvasSize, bmCaptchaChallengeTtlMs, bmCaptchaDecoyCount, bmCaptchaPowDifficulty, bmCaptchaTargetMax, bmCaptchaTargetMin, } from "./bm-captcha.config.js";
import { hmacHex, powPrefixForChallenge, randomId } from "./bm-captcha.crypto.js";
function mulberry32(seed) {
    return function next() {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashSeedToInt(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
export function glyphFromSeed(glyphSeed) {
    const rnd = mulberry32(hashSeedToInt(`glyph:${glyphSeed}`));
    return {
        hue: Math.floor(rnd() * 8),
        shape: Math.floor(rnd() * 6),
        rot: Math.floor(rnd() * 12) * 30,
    };
}
/** Digits that stay readable on a small coin (skip 0/1 confusion). */
const COIN_DIGITS = [2, 3, 4, 5, 6, 7, 8, 9];
function placeNonOverlapping(rnd, count, size, minDist) {
    const pts = [];
    const margin = 40;
    let guard = 0;
    while (pts.length < count && guard < count * 100) {
        guard += 1;
        const x = margin + rnd() * (size - margin * 2);
        const y = margin + rnd() * (size - margin * 2);
        if (pts.every((p) => Math.hypot(p.x - x, p.y - y) >= minDist))
            pts.push({ x, y });
    }
    while (pts.length < count) {
        pts.push({
            x: margin + rnd() * (size - margin * 2),
            y: margin + rnd() * (size - margin * 2),
        });
    }
    return pts;
}
/**
 * Sprite encoding for coins:
 *  - family = digit (2–9)  ← match key (also stored as morph for sample clarity)
 *  - morph  = metal style 0 gold / 1 silver / 2 copper / 3 violet
 *  - hue/sat/lit = metal tint jitter
 */
export function mintChallengePair(input) {
    const now = input.now ?? new Date();
    const challengeId = randomId(18);
    const createdAt = now.getTime();
    const expiresAt = createdAt + bmCaptchaChallengeTtlMs();
    const canvasSize = bmCaptchaCanvasSize();
    const sceneSeed = randomId(12);
    const layoutSalt = hmacHex(`coins|${input.userId}|${challengeId}|${sceneSeed}`);
    const rnd = mulberry32(hashSeedToInt(layoutSalt));
    // Easier defaults: clamp find count toward the low end of configured range.
    const tMin = Math.min(bmCaptchaTargetMin(), 3);
    const tMax = Math.min(bmCaptchaTargetMax(), Math.max(tMin, 3));
    const findCount = tMin + Math.floor(rnd() * (tMax - tMin + 1));
    const decoyCount = Math.max(5, Math.min(bmCaptchaDecoyCount(), 7));
    const total = findCount + decoyCount;
    const targetDigit = COIN_DIGITS[Math.floor(rnd() * COIN_DIGITS.length)];
    const decoyPool = COIN_DIGITS.filter((d) => d !== targetDigit);
    const positions = placeNonOverlapping(rnd, total, canvasSize, 52);
    const order = positions.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
    }
    const targetSlots = new Set(order.slice(0, findCount));
    const sprites = [];
    const targetIds = [];
    for (let i = 0; i < total; i++) {
        const pos = positions[i];
        const isTarget = targetSlots.has(i);
        const digit = isTarget ? targetDigit : decoyPool[Math.floor(rnd() * decoyPool.length)];
        const metal = Math.floor(rnd() * 4);
        // Metal base hues
        const metalHue = metal === 0 ? 42 : metal === 1 ? 210 : metal === 2 ? 22 : 275;
        const spr = {
            id: i,
            family: digit, // digit is the match key
            morph: metal,
            x: Math.round(pos.x * 10) / 10,
            y: Math.round(pos.y * 10) / 10,
            scale: 0.92 + rnd() * 0.28,
            rot: Math.floor(rnd() * 24) - 12, // slight tilt only
            hue: metalHue + (rnd() - 0.5) * 12,
            sat: 55 + rnd() * 25,
            lit: 52 + rnd() * 18,
            glow: 0.35 + rnd() * 0.35,
        };
        sprites.push(spr);
        if (isTarget)
            targetIds.push(i);
    }
    const sampleMetal = Math.floor(rnd() * 4);
    const sampleHue = sampleMetal === 0 ? 42 : sampleMetal === 1 ? 210 : sampleMetal === 2 ? 22 : 275;
    const sample = {
        family: targetDigit,
        morph: sampleMetal,
        scale: 1.2,
        rot: 0,
        hue: sampleHue,
        sat: 70,
        lit: 58,
        glow: 0.65,
    };
    const powDifficulty = bmCaptchaPowDifficulty();
    const powPrefix = powPrefixForChallenge(challengeId, input.userId);
    const secret = {
        challengeId,
        userId: input.userId,
        purpose: input.purpose,
        provider: input.provider,
        createdAt,
        expiresAt,
        targetIds: targetIds.slice().sort((a, b) => a - b),
        targetSig: `digit:${targetDigit}`,
        canvasSize,
        powDifficulty,
        powPrefix,
        attempts: 0,
        solved: false,
        dialTargetDeg: 0,
        correctTileId: 0,
        code: String(targetDigit),
    };
    const pub = {
        kind: "canvas_click",
        challengeId,
        purpose: input.purpose,
        provider: input.provider,
        expiresAt,
        canvasSize,
        findCount,
        sample,
        sprites,
        sceneSeed,
        pow: { difficulty: powDifficulty, prefix: powPrefix },
    };
    return { public: pub, secret };
}
