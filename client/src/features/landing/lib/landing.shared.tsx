import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ArrowUpRight, ChevronDown, Pickaxe, Wallet } from 'lucide-react';
import type { PublicStatsPayload } from '../../../shared/hooks/usePublicStatsPoll';

const LAUNCH_DATE = new Date('2026-03-05T00:00:00.000Z');
const HS_PER_ACTIVE_RIG = 4000;
const MIN_NETWORK_HS = 800_000;

export function uptimeDays(): number {
  return Math.floor((Date.now() - LAUNCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
}

export function estimateNetworkHashRate(publicStats: PublicStatsPayload | null): number {
  const rigs = publicStats?.activeMiners;
  if (typeof rigs === 'number' && rigs > 0) {
    return Math.max(rigs * HS_PER_ACTIVE_RIG, MIN_NETWORK_HS);
  }
  return MIN_NETWORK_HS;
}

export function useInViewOnce(): [RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);
  return [ref, visible];
}

export function useCountUp(end: number, enabled: boolean, decimals = 0): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!enabled || !Number.isFinite(end)) return undefined;
    let start: number | null = null;
    const dur = 1100;
    let raf = 0;
    const tick = (now: number) => {
      if (start == null) start = now;
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - (1 - t) ** 3;
      const next = 0 + (end - 0) * eased;
      setV(decimals > 0 ? Number(next.toFixed(decimals)) : Math.floor(next));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, enabled, decimals]);
  return v;
}

export function LiveMiningWidget() {
  const [blockProgress, setBlockProgress] = useState(42);
  const [blocksFound, setBlocksFound] = useState(127);
  const [earnings, setEarnings] = useState(3.82);
  const [hashrate, setHashrate] = useState(4200);

  useEffect(() => {
    const id = setInterval(() => {
      setBlockProgress((p) => {
        const next = p + Math.random() * 2.5 + 0.8;
        if (next >= 100) {
          setBlocksFound((b) => b + 1);
          setEarnings((e) => Number((e + 0.003).toFixed(3)));
          return next - 100;
        }
        return next;
      });
      setHashrate(3900 + Math.floor(Math.random() * 500));
    }, 220);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative w-full max-w-xs">
      <div className="absolute -inset-6 rounded-full bg-blue-500/15 blur-3xl" aria-hidden />
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-sky-500/20 to-violet-600/10 blur-xl" aria-hidden />
      <div className="relative rounded-2xl border border-white/12 bg-slate-900/95 backdrop-blur-sm shadow-2xl overflow-hidden">
        {/* Top accent line */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20">
                <Pickaxe className="h-3.5 w-3.5 text-sky-400" aria-hidden />
              </div>
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest font-mono">
                Rig #1
              </span>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-bold text-emerald-400 font-mono uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
              ONLINE
            </span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {[
              { label: 'Hashrate', value: `${hashrate.toLocaleString()} H/s`, color: 'text-sky-400' },
              { label: 'Blocos', value: String(blocksFound), color: 'text-violet-400' },
              { label: 'Ganhos', value: `${earnings.toFixed(3)} POL`, color: 'text-emerald-400' },
              { label: 'Eficiência', value: '98.2%', color: 'text-amber-400' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-slate-800/70 px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-wider text-slate-600 font-mono">{stat.label}</p>
                <p className={`mt-0.5 text-sm font-black font-mono ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Block progress */}
          <div>
            <div className="flex justify-between text-[9px] font-mono text-slate-600 mb-1.5 uppercase tracking-wider">
              <span>Bloco atual</span>
              <span>{Math.floor(blockProgress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-200"
                style={{ width: `${blockProgress}%` }}
              />
            </div>
          </div>

          <p className="mt-3.5 text-[9px] text-slate-700 text-center font-mono">
            Simulado — painel real após o cadastro
          </p>
        </div>
        {/* Bottom accent */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
      </div>
    </div>
  );
}

export function FaqItem({ id, question, answer }: { id: string; question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-900/50 overflow-hidden hover:border-sky-500/25 transition-colors duration-200">
      <button
        type="button"
        id={`${id}-btn`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-white hover:bg-white/4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        <span>{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-sky-400 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-btn`}
          className="px-6 pb-6 text-sm leading-relaxed border-t border-white/8 text-slate-400"
        >
          {answer}
        </div>
      ) : null}
    </div>
  );
}

// ─── Public feed ────────────────────────────────────────────────────────────

export type FeedRow = { id: number; user: string; amount: number; at: string };
export type PublicFeed = { withdrawals: FeedRow[]; deposits: FeedRow[] };

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export function FeedPanel({ title, rows, color }: { title: string; rows: FeedRow[]; color: 'emerald' | 'sky' }) {
  const border = color === 'emerald' ? 'border-emerald-500/20' : 'border-sky-500/20';
  const dot = color === 'emerald' ? 'bg-emerald-400' : 'bg-sky-400';
  const amtCls = color === 'emerald' ? 'text-emerald-400' : 'text-sky-400';
  const icon = color === 'emerald' ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <Wallet className="h-3 w-3" aria-hidden />;

  return (
    <div className={`rounded-2xl border ${border} bg-slate-900/60 backdrop-blur-sm overflow-hidden`}>
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
        <span className={`h-2 w-2 rounded-full ${dot} animate-pulse`} aria-hidden />
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 font-mono">{title}</span>
      </div>
      <ul className="divide-y divide-white/[0.04]">
        {rows.length === 0 ? (
          <li className="px-5 py-8 text-center text-xs text-slate-600 font-mono">sem dados</li>
        ) : (
          rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 ${amtCls}`}>{icon}</span>
                <span className="text-xs text-slate-300 font-mono truncate">{r.user}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs font-bold font-mono ${amtCls}`}>{r.amount.toFixed(4)} POL</span>
                <span className="text-[10px] text-slate-600 font-mono whitespace-nowrap">{timeAgo(r.at)}</span>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ─── Landing page ────────────────────────────────────────────────────────────
