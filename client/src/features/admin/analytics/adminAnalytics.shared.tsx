import type { LucideIcon } from 'lucide-react';

export type PeriodKey = 'week' | 'month' | 'year';

export type AnalyticsUserRef = {
  id: number;
  username?: string | null;
  email?: string | null;
};

export type AnalyticsSummary = {
  totalDistributed?: number;
  periodDistributed?: number;
  totalWithdrawals?: number;
  periodWithdrawals?: number;
  activeUsers?: number;
  blockCount?: number;
  totalBlocksEver?: number;
  networkHashRate?: number;
};

export type AnalyticsForecast = {
  userHashRate?: number;
  sharePercent?: number;
  day?: { pol?: number };
  week?: { pol?: number };
  month?: { pol?: number };
  year?: { pol?: number };
};

export type ChartPoint = { label: string; value: number };
export type DualChartPoint = { label: string; up: number; down: number };

export type TopEarnerRow = {
  userId: number;
  username?: string | null;
  total: number;
};

export type UserRecentBlockRow = {
  blockNumber?: number | string;
  rewardAmount?: number;
  createdAt?: string;
};

export type InflationResponse = {
  polPrice?: number;
  series: Array<{ label: string; distributed: number; withdrawn: number; cumulative: number }>;
  totals: {
    circulatingNet: number;
    totalDistributed: number;
    totalWithdrawn: number;
    avgDailyDistributed: number;
  };
};

export type ProjectionsResponse = {
  polPrice?: number;
  networkHashRate?: number;
  userHashRate?: number;
  sharePercent?: number;
  day?: { pol?: number };
  week?: { pol?: number };
  month?: { pol?: number };
  year?: { pol?: number };
};

export type WithdrawalsResponse = {
  polPrice?: number;
  series: Array<{ label: string; count: number; amount: number }>;
  totals?: { count?: number; amount?: number };
};

export type DistributionResponse = {
  polPrice?: number;
  series: Array<{ label: string; value: number; valueUsd?: number }>;
  totals?: { amount?: number };
  bySource?: Array<{ source: string; amount: number }>;
  miningExpected?: {
    siteAgeDays: number;
    launchDate: string;
    rewardBase: number;
    blockDurationMinutes: number;
    blocksPerDay: number;
    efficiencyPercent: number;
    expectedPol: number;
    expectedBlocks: number;
    actualPol: number;
    actualBlocks: number;
    missingPol: number;
    missingBlocks: number;
  };
};

export type WalletActivityPayload = {
  wallets?: Array<{
    label?: string | null;
    address?: string;
    summary?: { totalInPol?: number; totalInUsd?: number | null };
  }>;
};

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: '7 dias',
  month: '30 dias',
  year: '12 meses',
};

const COLOR_TEXT: Record<string, string> = {
  amber: 'text-amber-400',
  emerald: 'text-emerald-400',
  violet: 'text-violet-400',
  blue: 'text-sky-400',
  rose: 'text-rose-400',
};

const COLOR_BG: Record<string, string> = {
  amber: 'bg-amber-500/15',
  emerald: 'bg-emerald-500/15',
  violet: 'bg-violet-500/15',
  blue: 'bg-sky-500/15',
  rose: 'bg-rose-500/15',
};

export function fmtPol(val: unknown, maxFrac = 4): string {
  const n = Number(val || 0);
  return `${n.toFixed(maxFrac)} POL`;
}

export function fmtUsd(val: unknown, polPrice: number): string | null {
  if (!(polPrice > 0)) return null;
  return `~$${(Number(val || 0) * polPrice).toFixed(2)}`;
}

export function fmtUsdLong(val: unknown, polPrice: number): string | null {
  if (!(polPrice > 0)) return null;
  return `~$${(Number(val || 0) * polPrice).toFixed(4)}`;
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '--';
  const t = Math.round(seconds / 1e3);
  if (t < 60) return `${t}s`;
  const m = Math.round(t / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} dias`;
}

export function StatCard({
  label,
  polValue,
  usdValue,
  sub,
  icon: Icon,
  color = 'amber',
}: {
  label: string;
  polValue: string;
  usdValue?: string | null;
  sub?: string;
  icon: LucideIcon;
  color?: keyof typeof COLOR_TEXT | string;
}) {
  const text = COLOR_TEXT[color] ?? 'text-amber-400';
  const bg = COLOR_BG[color] ?? 'bg-amber-500/15';
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${bg}`}>
          <Icon className={`h-4 w-4 ${text}`} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      </div>
      <div>
        <p className={`text-base font-black ${text}`}>{polValue}</p>
        {usdValue ? <p className="mt-0.5 text-xs font-bold text-slate-500">{usdValue}</p> : null}
        {sub ? <p className="mt-1 text-[10px] text-slate-600">{sub}</p> : null}
      </div>
    </div>
  );
}

export function ForecastCard({
  label,
  pol,
  usdVal,
  highlight = false,
}: {
  label: string;
  pol: string;
  usdVal?: string | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-2xl border p-4 transition-colors ${
        highlight
          ? 'border-amber-500/25 bg-amber-500/10'
          : 'border-slate-700/40 bg-slate-800/40 hover:bg-slate-800/70'
      }`}
    >
      <p
        className={`text-[9px] font-black uppercase tracking-widest ${
          highlight ? 'text-amber-400' : 'text-slate-500'
        }`}
      >
        {label}
      </p>
      <p className={`text-sm font-black ${highlight ? 'text-amber-300' : 'text-white'}`}>{pol}</p>
      {usdVal ? <p className="text-[10px] font-bold text-slate-500">{usdVal}</p> : null}
    </div>
  );
}

export function MiniBarChart({
  data,
  polPrice,
  color = 'amber',
}: {
  data?: ChartPoint[];
  polPrice: number;
  color?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-slate-600">
        Sem dados no periodo
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.value), 1e-6);
  const bar = `bg-${color}-500/70 hover:bg-${color}-400`;
  return (
    <div className="flex h-44 w-full items-end gap-0.5">
      {data.map((point, i) => (
        <div key={`${point.label}-${i}`} className="group relative flex flex-1 flex-col items-center gap-0">
          <div
            className={`w-full cursor-default rounded-t transition-all ${bar}`}
            style={{ height: `${Math.max(3, (point.value / max) * 160)}px` }}
          />
          <div className="pointer-events-none absolute bottom-full z-20 mb-1 hidden flex-col items-center group-hover:flex">
            <div className="space-y-0.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[9px] font-black text-white shadow-xl">
              <div className="text-amber-400">{point.value.toFixed(6)} POL</div>
              {polPrice > 0 ? <div className="text-slate-400">${(point.value * polPrice).toFixed(4)}</div> : null}
              <div className="text-slate-500">{point.label}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DualBarChart({ data, polPrice }: { data?: DualChartPoint[]; polPrice: number }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-xs text-slate-600">
        Sem dados no periodo
      </div>
    );
  }
  const max = Math.max(...data.flatMap((d) => [d.up, d.down]), 1e-6);
  return (
    <div className="flex h-44 w-full items-end gap-1">
      {data.map((point, i) => (
        <div key={`${point.label}-${i}`} className="group relative flex flex-1 items-end gap-px">
          <div
            className="flex-1 rounded-t bg-emerald-500/70 transition-all hover:bg-emerald-400"
            style={{ height: `${Math.max(2, (point.up / max) * 160)}px` }}
          />
          <div
            className="flex-1 rounded-t bg-rose-500/70 transition-all hover:bg-rose-400"
            style={{ height: `${Math.max(2, (point.down / max) * 160)}px` }}
          />
          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 flex-col items-center group-hover:flex">
            <div className="space-y-0.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-[9px] font-black text-white shadow-xl">
              <div className="text-emerald-400">+{point.up.toFixed(4)} POL distribuído</div>
              <div className="text-rose-400">-{point.down.toFixed(4)} POL sacado</div>
              {polPrice > 0 ? (
                <div className="text-slate-400">net ${((point.up - point.down) * polPrice).toFixed(2)}</div>
              ) : null}
              <div className="text-slate-500">{point.label}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
