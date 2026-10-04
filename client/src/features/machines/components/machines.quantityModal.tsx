import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type MachineQuantityModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  quantityLabel?: string;
  max: number | string;
  min?: number;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: (qty: number) => void;
};

/**
 * Modal to pick how many stacked machines to transfer (backpack → warehouse).
 * Ported from legacy/client/src/shared/components/MachineQuantityModal.tsx (module-local copy,
 * following this module's self-containment doctrine — current/client has no shared/components
 * equivalent yet).
 */
export function MachineQuantityModal({
  open,
  onClose,
  title,
  subtitle,
  quantityLabel,
  max,
  min = 1,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
}: MachineQuantityModalProps) {
  const [qty, setQty] = useState(min);

  useEffect(() => {
    if (!open) return;
    const safeMax = Math.max(min, Number(max) || min);
    setQty(safeMax);
  }, [open, max, min]);

  if (!open || typeof document === 'undefined') return null;

  const safeMax = Math.max(min, Number(max) || min);
  const clamped = Math.min(safeMax, Math.max(min, Number(qty) || min));

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border-2 border-slate-800 bg-slate-900/95 p-6 shadow-[4px_4px_0px_#000000]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-black text-white uppercase tracking-wider">{title}</h2>
        {subtitle ? <p className="mt-2 text-xs sm:text-sm text-slate-400 font-medium">{subtitle}</p> : null}
        <label className="mt-6 block">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{quantityLabel ?? ''}</span>
          <input
            type="number"
            min={min}
            max={safeMax}
            disabled={busy}
            value={clamped}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isFinite(n)) {
                setQty(min);
                return;
              }
              setQty(Math.min(safeMax, Math.max(min, n)));
            }}
            className="mt-2 w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-4 py-3 text-lg font-black tabular-nums text-white outline-none focus:border-primary shadow-[2px_2px_0px_#000000] disabled:opacity-50"
          />
        </label>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-xl border-2 border-slate-700 bg-slate-900 px-5 py-2.5 text-xs font-bold text-slate-300 shadow-[2px_2px_0px_#000000] transition-all hover:bg-slate-800 disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(clamped)}
            className="min-h-11 rounded-xl bg-primary hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
