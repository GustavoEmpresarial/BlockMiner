/** Pure helpers for Offerwall.GG — no Prisma / tournament imports. */
import crypto from "node:crypto";

/**
 * HMAC-SHA256 of `userId:transactionId:currencyAmount` with the placement secret.
 * Compare with timing-safe equal on hex digests.
 */
export function verifyOfferwallGgSignature(
  secret: string,
  userId: string,
  transactionId: string,
  amount: string,
  signature: string,
): boolean {
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${transactionId}:${amount}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(String(signature).trim(), "utf8");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/** Empty allowlist = signature-only security (docs do not publish fixed IPs). */
export function parseAllowedIps(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isIpAllowed(allowed: Set<string>, ip: string): boolean {
  if (allowed.size === 0) return true;
  return allowed.has(ip);
}

export function buildOfferwallGgEmbedUrl(args: {
  publicKey: string;
  userId: number;
  baseUrl?: string;
}): string | null {
  const publicKey = String(args.publicKey ?? "").trim();
  if (!publicKey) return null;
  const base = String(args.baseUrl ?? "https://offerwall.gg/wall")
    .trim()
    .replace(/\/$/, "");
  return `${base}/${publicKey}?userId=${encodeURIComponent(String(args.userId))}`;
}

/** Map partner status string → ledger status (1 credit / 2 chargeback). */
export function mapOfferwallGgStatus(status: string, amount: string): number {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "reversed" || s === "2" || s === "chargeback") return 2;
  const n = Number(amount);
  if (Number.isFinite(n) && n < 0) return 2;
  return 1;
}
