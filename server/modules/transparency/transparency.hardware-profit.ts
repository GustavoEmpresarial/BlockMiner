/** Bitcoin base unit — 100 million satoshis per BTC. */
export const SATOSHI_PER_BTC = 100_000_000n;

const MS_PER_DAY = 86_400_000;

export function parseSatoshiInput(raw: unknown): bigint | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && raw <= 0) return null;
  const s = String(raw).trim();
  if (s.startsWith('-')) return null;
  try {
    const digits = s.replace(/[^\d]/g, '');
    if (!digits) return null;
    const value = BigInt(digits);
    if (value <= 0n) return null;
    return value;
  } catch {
    return null;
  }
}

export function parsePositiveDecimal(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function satoshiToBtc(satoshi: bigint): number {
  return Number(satoshi) / Number(SATOSHI_PER_BTC);
}

/** Convert satoshis to USD using the BTC/USD snapshot (USDC ≈ USD). */
export function computeEarnedUsd(satoshi: bigint, btcUsdPrice: number): number {
  const btc = satoshiToBtc(satoshi);
  const usd = btc * btcUsdPrice;
  return Math.round(usd * 100) / 100;
}

export type HardwareProfitLogRow = {
  earnedAt: Date;
  earnedUsd: number | string | { toString(): string };
  satoshiAmount?: bigint | string | number | null;
};

export type HardwareRoiSummary = {
  totalEarnedSatoshi: string;
  totalEarnedUsd: number;
  purchaseCostUsd: number;
  recoveredPct: number;
  remainingUsd: number;
  roiReached: boolean;
  avgDailyUsd: number | null;
  estimatedDaysToRoi: number | null;
  firstEarnedAt: string | null;
  lastEarnedAt: string | null;
  logCount: number;
};

function sumSatoshiAmount(logs: HardwareProfitLogRow[]): bigint {
  return logs.reduce((sum, row) => {
    if (row.satoshiAmount == null || row.satoshiAmount === '') return sum;
    try {
      const digits = String(row.satoshiAmount).replace(/[^\d]/g, '') || '0';
      return sum + BigInt(digits);
    } catch {
      return sum;
    }
  }, 0n);
}

export function computeHardwareRoiSummary(
  purchaseCostUsd: number,
  logs: HardwareProfitLogRow[],
): HardwareRoiSummary {
  const cost = Number.isFinite(purchaseCostUsd) && purchaseCostUsd > 0 ? purchaseCostUsd : 0;
  const sorted = [...logs].sort(
    (a, b) => new Date(a.earnedAt).getTime() - new Date(b.earnedAt).getTime(),
  );
  const totalEarnedUsd = sorted.reduce((sum, row) => {
    const v = Number(row.earnedUsd);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
  const roundedTotal = Math.round(totalEarnedUsd * 100) / 100;
  const totalEarnedSatoshi = sumSatoshiAmount(sorted).toString();
  const recoveredPct = cost > 0 ? Math.round((roundedTotal / cost) * 10_000) / 100 : 0;
  const remainingUsd = Math.max(0, Math.round((cost - roundedTotal) * 100) / 100);
  const roiReached = cost > 0 && roundedTotal >= cost;

  const first = sorted[0]?.earnedAt ?? null;
  const last = sorted[sorted.length - 1]?.earnedAt ?? null;
  let avgDailyUsd: number | null = null;
  let estimatedDaysToRoi: number | null = null;

  if (first && last && sorted.length >= 1) {
    const spanMs = Math.max(MS_PER_DAY, new Date(last).getTime() - new Date(first).getTime());
    const spanDays = spanMs / MS_PER_DAY;
    avgDailyUsd = Math.round((roundedTotal / spanDays) * 100) / 100;
    if (roiReached) {
      estimatedDaysToRoi = 0;
    } else if (avgDailyUsd > 0 && remainingUsd > 0) {
      estimatedDaysToRoi = Math.ceil(remainingUsd / avgDailyUsd);
    }
  }

  return {
    totalEarnedSatoshi,
    totalEarnedUsd: roundedTotal,
    purchaseCostUsd: cost,
    recoveredPct,
    remainingUsd,
    roiReached,
    avgDailyUsd,
    estimatedDaysToRoi,
    firstEarnedAt: first ? new Date(first).toISOString() : null,
    lastEarnedAt: last ? new Date(last).toISOString() : null,
    logCount: sorted.length,
  };
}

export function mapProfitLogForPublic(log: {
  id: number;
  earnedAt: Date;
  satoshiAmount: bigint;
  btcUsdPrice: unknown;
  earnedUsd: unknown;
  notes: string | null;
}) {
  return {
    id: log.id,
    earnedAt: log.earnedAt.toISOString(),
    satoshiAmount: log.satoshiAmount.toString(),
    btcUsdPrice: Number(log.btcUsdPrice),
    earnedUsd: Number(log.earnedUsd),
    notes: log.notes,
  };
}
