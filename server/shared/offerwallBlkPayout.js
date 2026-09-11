/**
 * Fixed BLK payout for external offerwall providers (Zerads, Offerwall.me, MoneyRain).
 * Product rule: 0.0005 BLK per credited click / completed action — not POL, not USD conversion.
 */
import { Prisma } from "@prisma/client";
export const OFFERWALL_BLK_PER_CLICK = 0.0005;
export function blkForOfferwallClicks(clicks) {
    const n = Math.max(0, Math.trunc(clicks));
    return new Prisma.Decimal((n * OFFERWALL_BLK_PER_CLICK).toFixed(8));
}
