import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Zap } from 'lucide-react';
import { MachineImage } from '../../machines/components/MachineImage';
import { formatHashrate } from '../../machines/lib/machines.shared';

export type MergeForgeStage = 'charge' | 'flash' | 'reveal';

export type MergeForgeTier = {
  name: string;
  level: number;
  glow: string;
  badge: string;
  border: string;
};

export type MergeForgeSnapshot = {
  name: string;
  imageUrl: string | null;
  from: MergeForgeTier;
  to: MergeForgeTier;
  fromHashRate: number;
  toHashRate: number;
  boostPercent: number;
};

export const MERGE_CHARGE_MS = 1700;
export const MERGE_FLASH_MS = 420;
const COUNT_UP_MS = 1100;
const SPARK_COUNT = 14;

function ForgeOverlayStyles() {
  return (
    <style>
      {`
        @keyframes bm-mf-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes bm-mf-left {
          0% { transform: translateX(-150px) rotate(-6deg); }
          70% { transform: translateX(-34px) rotate(-2deg); }
          100% { transform: translateX(0) scale(.55); opacity: 0; }
        }
        @keyframes bm-mf-right {
          0% { transform: translateX(150px) rotate(6deg); }
          70% { transform: translateX(34px) rotate(2deg); }
          100% { transform: translateX(0) scale(.55); opacity: 0; }
        }
        @keyframes bm-mf-shake {
          0%, 100% { translate: 0 0; }
          25% { translate: -2px 1px; }
          50% { translate: 2px -1px; }
          75% { translate: -1px -2px; }
        }
        @keyframes bm-mf-core {
          0% { transform: scale(.2); opacity: 0; }
          60% { transform: scale(.9); opacity: .9; }
          100% { transform: scale(1.25); opacity: 1; }
        }
        @keyframes bm-mf-flash {
          0% { opacity: 0; }
          25% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes bm-mf-ring {
          from { transform: translate(-50%, -50%) scale(.2); opacity: .9; }
          to { transform: translate(-50%, -50%) scale(3.2); opacity: 0; }
        }
        @keyframes bm-mf-spark {
          from { transform: translate(-50%, -50%) rotate(var(--a)) translateY(0); opacity: 1; }
          to { transform: translate(-50%, -50%) rotate(var(--a)) translateY(-190px); opacity: 0; }
        }
        @keyframes bm-mf-rays {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes bm-mf-pop {
          0% { transform: scale(.35); opacity: 0; }
          60% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bm-mf-rise {
          from { transform: translateY(14px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .bm-mf-backdrop { animation: bm-mf-fade 220ms ease-out both; }
        .bm-mf-left { animation: bm-mf-left ${MERGE_CHARGE_MS}ms cubic-bezier(.55,0,.75,.2) forwards, bm-mf-shake 120ms linear infinite; }
        .bm-mf-right { animation: bm-mf-right ${MERGE_CHARGE_MS}ms cubic-bezier(.55,0,.75,.2) forwards, bm-mf-shake 120ms linear infinite; }
        .bm-mf-core { animation: bm-mf-core ${MERGE_CHARGE_MS}ms ease-in forwards; }
        .bm-mf-flash { animation: bm-mf-flash ${MERGE_FLASH_MS}ms ease-out forwards; }
        .bm-mf-ring { animation: bm-mf-ring 700ms cubic-bezier(.16,1,.3,1) forwards; }
        .bm-mf-spark { animation: bm-mf-spark 750ms cubic-bezier(.16,1,.3,1) forwards; }
        .bm-mf-rays { animation: bm-mf-rays 9s linear infinite; }
        .bm-mf-pop { animation: bm-mf-pop 620ms cubic-bezier(.16,1,.3,1) both; }
        .bm-mf-rise { animation: bm-mf-rise 450ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .bm-mf-left, .bm-mf-right, .bm-mf-core, .bm-mf-ring, .bm-mf-spark, .bm-mf-rays { animation: none !important; }
          .bm-mf-left, .bm-mf-right, .bm-mf-spark, .bm-mf-ring { opacity: 0; }
        }
      `}
    </style>
  );
}

function useCountUp(from: number, to: number, active: boolean): number {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!active) {
      setValue(from);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, active]);
  return value;
}

export function MergeForgeOverlay({
  stage,
  snapshot,
  resultName,
  onClose,
}: {
  stage: MergeForgeStage;
  snapshot: MergeForgeSnapshot;
  resultName?: string;
  onClose: () => void;
}) {
  const revealed = stage === 'reveal';
  const startHashRate = snapshot.fromHashRate * 2;
  const shownHashRate = useCountUp(startHashRate, snapshot.toHashRate, revealed);

  useEffect(() => {
    if (!revealed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, onClose]);

  const machine = (className: string) => (
    <div
      className={`h-28 w-28 sm:h-32 sm:w-32 rounded-2xl border-2 ${snapshot.from.border} bg-slate-900/90 p-3 shadow-[4px_4px_0px_#000000] ${className}`}
    >
      <MachineImage imageUrl={snapshot.imageUrl} name={snapshot.name} className="h-full w-full object-contain" />
    </div>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={revealed ? `${resultName ?? snapshot.name} ${snapshot.to.name}` : 'Fundindo'}
      data-testid="merge-forge-overlay"
      data-stage={stage}
      className="bm-mf-backdrop fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm px-4"
      onClick={revealed ? onClose : undefined}
    >
      <ForgeOverlayStyles />

      <div className="relative flex h-[420px] w-full max-w-md items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {stage === 'charge' ? (
          <>
            <div
              className="bm-mf-core absolute h-40 w-40 rounded-full"
              style={{ background: `radial-gradient(circle, ${snapshot.to.glow} 0%, transparent 70%)` }}
            />
            <div className="absolute flex items-center justify-center">{machine('bm-mf-left')}</div>
            <div className="absolute flex items-center justify-center">{machine('bm-mf-right')}</div>
            <p className="absolute bottom-6 text-xs font-black uppercase tracking-[0.3em] text-slate-300 animate-pulse">
              Fundindo…
            </p>
          </>
        ) : null}

        {stage !== 'charge' ? (
          <>
            <div
              className="bm-mf-ring absolute left-1/2 top-1/2 h-40 w-40 rounded-full border-4"
              style={{ borderColor: snapshot.to.glow }}
            />
            {Array.from({ length: SPARK_COUNT }, (_, i) => (
              <span
                key={i}
                className="bm-mf-spark absolute left-1/2 top-1/2 h-3 w-1 rounded-full"
                style={{ ['--a' as string]: `${(360 / SPARK_COUNT) * i}deg`, background: snapshot.to.glow }}
              />
            ))}
          </>
        ) : null}

        {revealed ? (
          <div className="relative flex flex-col items-center text-center">
            <span
              className={`bm-mf-rise relative rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider ${snapshot.to.badge}`}
            >
              Nível {snapshot.to.level} · {snapshot.to.name}
            </span>
            <div className="relative mt-4">
              <div
                className="bm-mf-rays pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] rounded-full opacity-70"
                style={{
                  transform: 'translate(-50%, -50%)',
                  background: `repeating-conic-gradient(${snapshot.to.glow} 0deg 8deg, transparent 8deg 24deg)`,
                  WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 65%)',
                  maskImage: 'radial-gradient(circle, #000 0%, transparent 65%)',
                }}
              />
              <div
                className={`bm-mf-pop relative h-40 w-40 rounded-3xl border-2 ${snapshot.to.border} bg-slate-900 p-4`}
                style={{ boxShadow: `0 0 60px ${snapshot.to.glow}, 4px 4px 0px #000000` }}
              >
                <MachineImage imageUrl={snapshot.imageUrl} name={snapshot.name} className="h-full w-full object-contain" />
              </div>
            </div>
            <h3 className="bm-mf-rise relative mt-5 text-xl font-black text-white" style={{ animationDelay: '120ms' }}>
              {resultName ?? snapshot.name}
            </h3>
            <div
              className="bm-mf-rise relative mt-2 flex items-center gap-2 font-mono text-sm"
              style={{ animationDelay: '220ms' }}
            >
              <span className="text-slate-400">{formatHashrate(startHashRate)}</span>
              <ArrowRight className="h-4 w-4 text-slate-500" />
              <span className="font-black text-emerald-400 tabular-nums" data-testid="merge-forge-hashrate">
                {formatHashrate(shownHashRate)}
              </span>
            </div>
            <span
              className="bm-mf-rise relative mt-2 inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-black text-emerald-300"
              style={{ animationDelay: '320ms' }}
            >
              <Zap className="h-3 w-3 fill-current" />+{snapshot.boostPercent}% hashrate
            </span>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="bm-mf-rise relative mt-6 rounded-2xl border-2 border-emerald-400 bg-emerald-500 px-8 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[4px_4px_0px_#000000] transition-colors hover:bg-emerald-400 active:translate-x-0.5 active:translate-y-0.5"
              style={{ animationDelay: '420ms' }}
            >
              Continuar
            </button>
          </div>
        ) : null}
      </div>

      {stage === 'flash' ? (
        <div className="bm-mf-flash pointer-events-none fixed inset-0" style={{ background: '#ffffff' }} />
      ) : null}
    </div>,
    document.body,
  );
}
