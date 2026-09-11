import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { api } from '../../../shared/auth/auth.store';
import { toast } from 'sonner';
import { readAxiosResponseMessage } from '../lib/admin.api';

export type RackMinerSlot = { x: number; y: number; w: number; h: number };
export type Rack = {
  id: number;
  name: string;
  imageUrl: string;
  hashRate: number;
  width: number;
  height: number;
  slotCount: number;
  minerSlots: RackMinerSlot[] | null;
  sortOrder: number;
  isActive: boolean;
};

export const inputCls = 'bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-primary outline-none';
export const btnPrimary = 'inline-flex items-center gap-2 bg-primary hover:brightness-110 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg transition';

/** Modal: position each miner bay inside the rack's own artwork (drag dots, fixed size). */
export function RackMinerSlotsModal({
  rack,
  onClose,
  onSaved,
}: {
  rack: Rack;
  onClose: () => void;
  onSaved: (minerSlots: RackMinerSlot[]) => void;
}): ReactElement {
  const [slots, setSlots] = useState<RackMinerSlot[]>(() => {
    if (rack.minerSlots && rack.minerSlots.length > 0) return rack.minerSlots;
    // Default: auto-fill a bottom row so the admin has a starting point to drag from.
    const n = Math.max(1, Math.min(rack.slotCount, 8));
    const w = 1 / n;
    return Array.from({ length: n }, (_, i) => ({ x: i * w, y: 0.82, w, h: 0.16 }));
  });
  const [saving, setSaving] = useState(false);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [boxSize, setBoxSize] = useState({ w: 1, h: 1 });
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ idx: number; startX: number; startY: number; orig: RackMinerSlot } | null>(null);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBoxSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Same "contain, bottom-anchored, centered horizontally" math the live user canvas uses when
  // drawing the rack — dots must be authored against this exact sub-rect, not the outer square box.
  const drawn = (() => {
    if (!imgNatural || !boxSize.w || !boxSize.h) return { x: 0, y: 0, w: boxSize.w, h: boxSize.h };
    const ar = imgNatural.w / imgNatural.h;
    let dw = boxSize.w, dh = boxSize.w / ar;
    if (dh > boxSize.h) { dh = boxSize.h; dw = boxSize.h * ar; }
    return { x: (boxSize.w - dw) / 2, y: boxSize.h - dh, w: dw, h: dh };
  })();

  const addBay = () => {
    setSlots((prev) => [...prev, { x: 0.4, y: 0.4, w: 0.12, h: 0.12 }].slice(0, 24));
  };
  const removeBay = (idx: number) => setSlots((prev) => prev.filter((_, i) => i !== idx));

  const onDotDown = (e: ReactPointerEvent, idx: number) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { idx, startX: e.clientX, startY: e.clientY, orig: { ...slots[idx] } };
  };
  const onBoxMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || !drawn.w || !drawn.h) return;
    const dx = (e.clientX - d.startX) / drawn.w;
    const dy = (e.clientY - d.startY) / drawn.h;
    setSlots((prev) => prev.map((s, i) => (i === d.idx
      ? { ...s, x: clamp(d.orig.x + dx, 0, 1 - s.w), y: clamp(d.orig.y + dy, 0, 1 - s.h) }
      : s)));
  };
  const onBoxUp = () => { dragRef.current = null; };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put(`/admin/sala/racks/${rack.id}/miner-slots`, { slots });
      if (res.data?.ok) {
        toast.success('Posições salvas.');
        onSaved(res.data.rack?.minerSlots ?? slots);
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar posições.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-gray-700 rounded-2xl p-6 max-w-xl w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">Posições dos miners — {rack.name}</h3>
          <button onClick={addBay} className="inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Adicionar baia
          </button>
        </div>
        <p className="text-[11px] text-gray-500">Arraste os pontos numerados pra onde os miners devem encaixar no rack · {slots.length} baias</p>
        <div
          ref={boxRef}
          onPointerMove={onBoxMove}
          onPointerUp={onBoxUp}
          onPointerLeave={onBoxUp}
          className="relative w-full aspect-square rounded-xl bg-black/40 ring-1 ring-gray-700 overflow-hidden touch-none select-none"
        >
          <img
            src={rack.imageUrl}
            alt={rack.name}
            draggable={false}
            className="pointer-events-none"
            onLoad={(e) => setImgNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ position: 'absolute', left: drawn.x, top: drawn.y, width: drawn.w, height: drawn.h }}
          />
          {/* Dots are positioned as % of the rack's actual drawn rect above — same coordinate
              space the live user canvas uses, so what you place here lines up exactly there. */}
          <div className="absolute pointer-events-none" style={{ left: drawn.x, top: drawn.y, width: drawn.w, height: drawn.h }}>
            {slots.map((s, i) => (
              <div
                key={i}
                onPointerDown={(e) => onDotDown(e, i)}
                className="absolute rounded bg-sky-500/40 ring-2 ring-sky-400 cursor-move flex items-center justify-center text-[10px] font-black text-white pointer-events-auto"
                style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }}
              >
                {i + 1}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); removeBay(i); }}
                  className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white">Cancelar</button>
          <button onClick={save} disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar posições
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal: edit an existing rack's name, hashrate, size, miner-bay count, and image. */
export function RackEditModal({
  rack,
  onClose,
  onSaved,
}: {
  rack: Rack;
  onClose: () => void;
  onSaved: (updated: Partial<Rack>) => void;
}): ReactElement {
  const [name, setName] = useState(rack.name);
  const [hashRate, setHashRate] = useState(String(rack.hashRate));
  const [w, setW] = useState(rack.width);
  const [h, setH] = useState(rack.height);
  const [slotCount, setSlotCount] = useState(rack.slotCount);
  const [imgUrl, setImgUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error('Nome obrigatório.');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      fd.append('hashRate', hashRate || '0');
      fd.append('width', String(w));
      fd.append('height', String(h));
      fd.append('slotCount', String(slotCount));
      if (file) fd.append('image', file);
      else if (imgUrl.trim()) fd.append('imageUrl', imgUrl.trim());
      const res = await api.patch(`/admin/sala/racks/${rack.id}`, fd);
      if (res.data?.ok) {
        toast.success('Rack atualizado.');
        onSaved(res.data.rack);
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao atualizar rack.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-gray-700 rounded-2xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-black text-white uppercase tracking-widest">Editar rack</h3>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-lg bg-black/30 flex items-center justify-center shrink-0">
            <img src={rack.imageUrl} alt={rack.name} className="max-w-[80%] max-h-[80%] object-contain" />
          </div>
          <p className="text-[11px] text-gray-500">Imagem atual · escolha um novo arquivo ou URL abaixo pra trocar</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} w-full`} /></Field>
          <Field label="Hashrate"><input type="number" step="any" value={hashRate} onChange={(e) => setHashRate(e.target.value)} className={`${inputCls} w-full`} /></Field>
          <Field label="W"><input type="number" min={1} max={4} value={w} onChange={(e) => setW(Number(e.target.value))} className={`${inputCls} w-full`} /></Field>
          <Field label="H"><input type="number" min={1} max={4} value={h} onChange={(e) => setH(Number(e.target.value))} className={`${inputCls} w-full`} /></Field>
          <Field label="Miners"><input type="number" min={1} max={24} value={slotCount} onChange={(e) => setSlotCount(Number(e.target.value))} className={`${inputCls} w-full`} /></Field>
        </div>
        <Field label="Nova imagem (arquivo)"><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs text-gray-400" /></Field>
        <Field label="ou nova URL"><input value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} placeholder="https://..." className={`${inputCls} w-full`} /></Field>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white">Cancelar</button>
          <button onClick={save} disabled={saving} className={btnPrimary}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
      {children}
    </label>
  );
}
