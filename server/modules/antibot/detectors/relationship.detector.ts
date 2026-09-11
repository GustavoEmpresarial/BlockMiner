/**
 * Multi-account relationship signals from server-side session/wallet counts.
 * Structural tier — thresholds tuned to reduce CGNAT / shared-device false positives.
 */
import type { AntibotDetector, AntibotEvidence, DetectorContext } from "../antibot.types.js";
import { resolveWeight } from "../antibot.weights.js";

function envPositiveInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.floor(raw);
}

/** Distinct accounts on same public IP before shared_ip fires. */
const IP_ACCOUNT_THRESHOLD = envPositiveInt("ANTIBOT_SHARED_IP_ACCOUNTS", 8);
/** Distinct accounts sharing the same fingerprint. */
const FINGERPRINT_ACCOUNT_THRESHOLD = envPositiveInt("ANTIBOT_SHARED_FP_ACCOUNTS", 4);
/** Distinct users with the same wallet address. */
const WALLET_ACCOUNT_THRESHOLD = envPositiveInt("ANTIBOT_SHARED_WALLET_ACCOUNTS", 2);

export const relationshipDetector: AntibotDetector = {
  name: "relationship",
  async detect(ctx: DetectorContext): Promise<AntibotEvidence[]> {
    const out: AntibotEvidence[] = [];
    const dev = ctx.telemetry.device ?? {};
    const fingerprint = dev.fingerprint ?? null;

    if (ctx.ip) {
      const ipAccounts = await ctx.prisma.antibotSession.groupBy({
        by: ["userId"],
        where: { ip: ctx.ip },
      });
      if (ipAccounts.length >= IP_ACCOUNT_THRESHOLD) {
        out.push({
          detector: "relationship",
          code: "shared_ip_many_accounts",
          ...resolveWeight("shared_ip_many_accounts"),
          metadata: { ip: ctx.ip, accountCount: ipAccounts.length },
        });
      }
    }

    if (fingerprint) {
      const fpAccounts = await ctx.prisma.antibotSession.groupBy({
        by: ["userId"],
        where: { fingerprint },
      });
      if (fpAccounts.length >= FINGERPRINT_ACCOUNT_THRESHOLD) {
        out.push({
          detector: "relationship",
          code: "shared_fingerprint_accounts",
          ...resolveWeight("shared_fingerprint_accounts"),
          metadata: { fingerprint, accountCount: fpAccounts.length },
        });
      }
    }

    if (ctx.userId != null) {
      const me = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { walletAddress: true },
      });
      const wallet = me?.walletAddress ?? null;
      if (wallet) {
        const walletAccounts = await ctx.prisma.user.count({
          where: { walletAddress: wallet },
        });
        if (walletAccounts >= WALLET_ACCOUNT_THRESHOLD) {
          out.push({
            detector: "relationship",
            code: "shared_wallet_accounts",
            ...resolveWeight("shared_wallet_accounts"),
            metadata: { walletAddressMasked: maskWallet(wallet), accountCount: walletAccounts },
          });
        }
      }
    }

    return out;
  },
};

function maskWallet(w: string): string {
  if (w.length <= 10) return "****";
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}
