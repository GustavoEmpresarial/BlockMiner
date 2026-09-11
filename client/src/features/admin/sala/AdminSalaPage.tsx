import { useState, useEffect, useCallback, useRef, type FormEvent, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { Plus, Trash2, Boxes, Save, Grid3x3, Loader2, Eye, EyeOff, Pencil, Image as ImageIcon } from 'lucide-react';
import { api } from '../../../shared/auth/auth.store';
import { toast } from 'sonner';
import { readAxiosResponseMessage } from '../lib/admin.api';
import {
  btnPrimary,
  Field,
  inputCls,
  RackEditModal,
  RackMinerSlotsModal,
} from './adminSala.parts';
import type { Rack } from './adminSala.parts';

type Slot = { id: number; roomNumber: number; xPct: number; yPct: number; wPct: number; hPct: number };
type Room = { roomNumber: number; gridWidth: number; gridHeight: number; bgImageUrl: string | null };
type AdminSalaResponse = { ok: true; rooms: Room[]; slots: Slot[]; racks: Rack[] };

type EditSlot = { xPct: number; yPct: number; wPct: number; hPct: number };

export default function AdminSala(): ReactElement {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allSlots, setAllSlots] = useState<Slot[]>([]);
  const [room, setRoom] = useState(1);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [editSlots, setEditSlots] = useState<EditSlot[]>([]);
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ mode: 'move' | 'resize'; idx: number; startX: number; startY: number; orig: EditSlot } | null>(null);
  const lastDragEndRef = useRef<number>(0);
  const [loading, setLoading] = useState(true);
  const [savingCanvas, setSavingCanvas] = useState(false);
  const [savingSlots, setSavingSlots] = useState(false);

  // Canvas form (for the selected room)
  const [gw, setGw] = useState(12);
  const [gh, setGh] = useState(8);
  const [bgFile, setBgFile] = useState<File | null>(null);

  const canvas = rooms.find((r) => r.roomNumber === room) ?? rooms[0] ?? null;
  const [bgAspect, setBgAspect] = useState<number | null>(null);
  useEffect(() => {
    const url = canvas?.bgImageUrl;
    if (!url) { setBgAspect(null); return; }
    const img = new Image();
    img.onload = () => setBgAspect(img.naturalWidth / img.naturalHeight);
    img.onerror = () => setBgAspect(null);
    img.src = url;
  }, [canvas?.bgImageUrl]);

  // Rack form
  const [rName, setRName] = useState('');
  const [rHash, setRHash] = useState('');
  const [rW, setRW] = useState(1);
  const [rH, setRH] = useState(1);
  const [rSlots, setRSlots] = useState(8);
  const [rImgUrl, setRImgUrl] = useState('');
  const [rFile, setRFile] = useState<File | null>(null);
  const [addingRack, setAddingRack] = useState(false);
  const [editingRackId, setEditingRackId] = useState<number | null>(null);
  const [editingRackFormId, setEditingRackFormId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<AdminSalaResponse>('/admin/sala');
      if (res.data?.ok) {
        setRooms(res.data.rooms);
        setAllSlots(res.data.slots);
        setRacks(res.data.racks);
      }
    } catch {
      toast.error('Erro ao carregar a sala (admin).');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Sync the editor form ONLY when the selected room actually changes (or on first load) — NOT on
  // every background reload (saveCanvas/addRack/etc. all call load()), which would otherwise wipe
  // any unsaved slot positions the admin is mid-edit on.
  const syncedRoomRef = useRef<number | null>(null);
  useEffect(() => {
    const cur = rooms.find((r) => r.roomNumber === room);
    if (!cur) return;
    if (syncedRoomRef.current === room) return;
    syncedRoomRef.current = room;
    setGw(cur.gridWidth);
    setGh(cur.gridHeight);
    setSelIdx(null);
    setEditSlots(
      allSlots
        .filter((s) => s.roomNumber === room)
        .map((s) => ({ xPct: s.xPct, yPct: s.yPct, wPct: s.wPct, hPct: s.hPct })),
    );
  }, [room, rooms, allSlots]);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const addSlot = () => {
    setEditSlots((prev) => [...prev, { xPct: 0.44, yPct: 0.42, wPct: 0.09, hPct: 0.18 }]);
    setSelIdx(editSlots.length);
  };
  // Click anywhere empty on the canvas (not on an existing slot): add a rack centered on that point.
  const addSlotAt = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // ignore clicks that bubbled from a slot/handle/button
    if (Date.now() - lastDragEndRef.current < 250) return; // ignore the click that follows a drag
    const el = editorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = 0.09;
    const h = 0.18;
    const xPct = clamp((e.clientX - rect.left) / rect.width - w / 2, 0, 1 - w);
    const yPct = clamp((e.clientY - rect.top) / rect.height - h / 2, 0, 1 - h);
    setEditSlots((prev) => {
      setSelIdx(prev.length);
      return [...prev, { xPct, yPct, wPct: w, hPct: h }];
    });
  };
  const removeSlot = (idx: number) => {
    setEditSlots((prev) => prev.filter((_, i) => i !== idx));
    setSelIdx(null);
  };

  // Edit one slot field via a % number input (0..100). Deterministic positioning, no drag needed.
  const setSlotFieldPct = (idx: number, field: keyof EditSlot, valuePct: number) => {
    const v = clamp((Number(valuePct) || 0) / 100, field === 'wPct' ? 0.02 : field === 'hPct' ? 0.03 : 0, 1);
    setEditSlots((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const next = { ...s, [field]: v };
      // keep the box inside the canvas after an edit
      next.wPct = Math.min(next.wPct, 1);
      next.hPct = Math.min(next.hPct, 1);
      next.xPct = clamp(next.xPct, 0, 1 - next.wPct);
      next.yPct = clamp(next.yPct, 0, 1 - next.hPct);
      return next;
    }));
  };

  const onSlotPointerDown = (e: ReactPointerEvent, idx: number, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelIdx(idx);
    dragRef.current = { mode, idx, startX: e.clientX, startY: e.clientY, orig: { ...editSlots[idx] } };
  };
  const onEditorPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    const el = editorRef.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / rect.width;
    const dy = (e.clientY - d.startY) / rect.height;
    setEditSlots((prev) => prev.map((s, i) => {
      if (i !== d.idx) return s;
      if (d.mode === 'move') {
        return { ...s, xPct: clamp(d.orig.xPct + dx, 0, 1 - s.wPct), yPct: clamp(d.orig.yPct + dy, 0, 1 - s.hPct) };
      }
      return { ...s, wPct: clamp(d.orig.wPct + dx, 0.03, 1 - s.xPct), hPct: clamp(d.orig.hPct + dy, 0.04, 1 - s.yPct) };
    }));
  };
  const onEditorPointerUp = () => { if (dragRef.current) lastDragEndRef.current = Date.now(); dragRef.current = null; };

  const saveCanvas = async () => {
    setSavingCanvas(true);
    try {
      const fd = new FormData();
      fd.append('roomNumber', String(room));
      fd.append('gridWidth', String(gw));
      fd.append('gridHeight', String(gh));
      if (bgFile) fd.append('image', bgFile);
      const res = await api.put('/admin/sala/canvas', fd);
      if (res.data?.ok) {
        toast.success('Canvas salvo.');
        setBgFile(null);
        await load();
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar canvas.');
    } finally {
      setSavingCanvas(false);
    }
  };

  const saveSlots = async () => {
    setSavingSlots(true);
    try {
      const res = await api.put('/admin/sala/slots', { roomNumber: room, slots: editSlots });
      if (res.data?.ok) {
        toast.success(`${res.data.slots.length} slots salvos.`);
        syncedRoomRef.current = null; // force re-sync from the just-saved (server-clamped) data
        await load();
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar slots.');
    } finally {
      setSavingSlots(false);
    }
  };

  const addRack = async (e: FormEvent) => {
    e.preventDefault();
    if (!rName.trim()) return toast.error('Nome obrigatório.');
    if (!rFile && !rImgUrl.trim()) return toast.error('Envie uma imagem ou informe uma URL.');
    setAddingRack(true);
    try {
      const fd = new FormData();
      fd.append('name', rName.trim());
      fd.append('hashRate', rHash || '0');
      fd.append('width', String(rW));
      fd.append('height', String(rH));
      fd.append('slotCount', String(rSlots));
      if (rFile) fd.append('image', rFile);
      else fd.append('imageUrl', rImgUrl.trim());
      const res = await api.post('/admin/sala/racks', fd);
      if (res.data?.ok) {
        toast.success('Rack adicionado.');
        setRName(''); setRHash(''); setRW(1); setRH(1); setRSlots(8); setRImgUrl(''); setRFile(null);
        await load();
      }
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao adicionar rack.');
    } finally {
      setAddingRack(false);
    }
  };

  const toggleActive = async (r: Rack) => {
    try {
      await api.patch(`/admin/sala/racks/${r.id}`, { isActive: !r.isActive });
      await load();
    } catch {
      toast.error('Erro ao atualizar rack.');
    }
  };

  const deleteRack = async (r: Rack) => {
    if (!confirm(`Excluir "${r.name}"? Remove de todas as salas dos usuários.`)) return;
    try {
      await api.delete(`/admin/sala/racks/${r.id}`);
      await load();
    } catch {
      toast.error('Erro ao excluir rack.');
    }
  };

  if (loading || !canvas) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-3">
          <Boxes className="w-7 h-7 text-primary" /> Sala (RollerCoin) — Layout
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Defina o catálogo de racks e desenhe os slots do canvas. O usuário arrasta os racks para os slots.
        </p>
      </div>

      {/* Canvas editor */}
      <section className="bg-surface border border-gray-800/50 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
          <Grid3x3 className="w-4 h-4 text-primary" /> Canvas & Slots
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {rooms.map((r) => (
            <button
              key={r.roomNumber}
              onClick={() => setRoom(r.roomNumber)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition ${room === r.roomNumber ? 'bg-primary text-white' : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700'}`}
            >
              Sala {r.roomNumber}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Largura (cols)">
            <input type="number" min={1} max={40} value={gw} onChange={(e) => setGw(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Altura (linhas)">
            <input type="number" min={1} max={40} value={gh} onChange={(e) => setGh(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Fundo (imagem)">
            <input type="file" accept="image/*" onChange={(e) => setBgFile(e.target.files?.[0] ?? null)} className="text-xs text-gray-400" />
          </Field>
          <button onClick={saveCanvas} disabled={savingCanvas} className={btnPrimary}>
            {savingCanvas ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar canvas
          </button>
        </div>
        {canvas.bgImageUrl && (
          <p className="text-[11px] text-gray-500 flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Fundo atual definido.</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={addSlot} className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition">
            <Plus className="w-4 h-4" /> Adicionar rack
          </button>
          <p className="text-[11px] text-gray-500">Clique num espaço vazio da imagem pra criar um rack ali · arraste pra reposicionar · alça no canto pra redimensionar · <span className="font-bold text-gray-300">{editSlots.length} racks nesta sala</span> — lembre de clicar em "Salvar slots" no final</p>
        </div>
        {/* Free-position editor over the big room image */}
        <div
          ref={editorRef}
          onClick={addSlotAt}
          onPointerMove={onEditorPointerMove}
          onPointerUp={onEditorPointerUp}
          onPointerLeave={onEditorPointerUp}
          className="relative w-full rounded-xl overflow-hidden ring-1 ring-gray-700 select-none touch-none cursor-crosshair"
          style={{
            aspectRatio: `${bgAspect ?? gw / gh}`,
            backgroundImage: canvas.bgImageUrl ? `url(${canvas.bgImageUrl})` : undefined,
            backgroundSize: '100% 100%',
            backgroundColor: canvas.bgImageUrl ? undefined : '#0f172a',
          }}
        >
          {editSlots.map((s, i) => (
            <div
              key={`s-${i}`}
              onPointerDown={(e) => onSlotPointerDown(e, i, 'move')}
              className={`absolute rounded ring-2 flex items-center justify-center text-[10px] font-black text-white cursor-move ${selIdx === i ? 'ring-emerald-400 bg-emerald-400/25' : 'ring-primary/80 bg-primary/25'}`}
              style={{ left: `${s.xPct * 100}%`, top: `${s.yPct * 100}%`, width: `${s.wPct * 100}%`, height: `${s.hPct * 100}%` }}
            >
              {i + 1}
              {/* remove */}
              <button
                onPointerDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); removeSlot(i); }}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow"
                title="Remover"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              {/* resize handle */}
              <span
                onPointerDown={(e) => onSlotPointerDown(e, i, 'resize')}
                className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-sm bg-white/90 border border-primary cursor-nwse-resize"
                title="Redimensionar"
              />
            </div>
          ))}
        </div>
        {/* Slots list — precise numeric X/Y/W/H (%) per rack, like the reference layout editor. */}
        {editSlots.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Slots criados ({editSlots.length})</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {editSlots.map((s, i) => (
                <div
                  key={i}
                  onClick={() => setSelIdx(i)}
                  className={`flex items-center gap-2 rounded-lg p-2 cursor-pointer ${selIdx === i ? 'bg-emerald-500/15 ring-1 ring-emerald-400/60' : 'bg-gray-900/50 hover:bg-gray-800/60'}`}
                >
                  <span className="text-xs font-black text-white w-6 text-center shrink-0">#{i + 1}</span>
                  {(['xPct', 'yPct', 'wPct', 'hPct'] as const).map((f) => (
                    <label key={f} className="flex items-center gap-1">
                      <span className="text-[9px] font-black text-gray-500 uppercase">{f[0]}</span>
                      <input
                        type="number" min={0} max={100} step={1}
                        value={Math.round(s[f] * 100)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setSlotFieldPct(i, f, Number(e.target.value))}
                        className="w-14 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-white text-xs"
                      />
                      <span className="text-[9px] text-gray-600">%</span>
                    </label>
                  ))}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSlot(i); }}
                    className="ml-auto p-1 rounded bg-red-500/20 hover:bg-red-500/40 text-red-300 shrink-0"
                    title="Remover"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={saveSlots} disabled={savingSlots} className={btnPrimary}>
          {savingSlots ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar slots
        </button>
      </section>

      {/* Rack catalog */}
      <section className="bg-surface border border-gray-800/50 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
          <Boxes className="w-4 h-4 text-primary" /> Catálogo de Racks ({racks.length})
        </h2>

        <form onSubmit={addRack} className="flex flex-wrap items-end gap-3 border-b border-gray-800/50 pb-4">
          <Field label="Nome"><input value={rName} onChange={(e) => setRName(e.target.value)} className={inputCls} /></Field>
          <Field label="Hashrate"><input type="number" step="any" value={rHash} onChange={(e) => setRHash(e.target.value)} className={inputCls} /></Field>
          <Field label="W"><input type="number" min={1} max={4} value={rW} onChange={(e) => setRW(Number(e.target.value))} className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm" /></Field>
          <Field label="H"><input type="number" min={1} max={4} value={rH} onChange={(e) => setRH(Number(e.target.value))} className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm" /></Field>
          <Field label="Miners"><input type="number" min={1} max={24} value={rSlots} onChange={(e) => setRSlots(Number(e.target.value))} className="w-20 bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-white text-sm" /></Field>
          <Field label="Imagem (arquivo)"><input type="file" accept="image/*" onChange={(e) => setRFile(e.target.files?.[0] ?? null)} className="text-xs text-gray-400" /></Field>
          <Field label="ou URL"><input value={rImgUrl} onChange={(e) => setRImgUrl(e.target.value)} placeholder="https://..." className={inputCls} /></Field>
          <button type="submit" disabled={addingRack} className={btnPrimary}>
            {addingRack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
          </button>
        </form>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {racks.map((r) => (
            <div key={r.id} className={`rounded-xl border p-3 flex flex-col items-center gap-2 ${r.isActive ? 'border-gray-700 bg-gray-800/40' : 'border-gray-800 bg-gray-900/40 opacity-60'}`}>
              <div className="w-16 h-16 rounded-lg bg-black/30 flex items-center justify-center">
                <img src={r.imageUrl} alt={r.name} className="max-w-[80%] max-h-[80%] object-contain" />
              </div>
              <p className="text-xs font-black text-white text-center truncate w-full">{r.name}</p>
              <p className="text-[10px] text-primary font-bold">{r.hashRate} H/s · {r.width}×{r.height} · {r.slotCount} miners</p>
              <div className="flex gap-2">
                <button onClick={() => setEditingRackFormId(r.id)} title="Editar rack" className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/40 text-amber-300">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingRackId(r.id)} title="Posições dos miners" className="p-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/40 text-sky-300">
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button onClick={() => toggleActive(r)} title={r.isActive ? 'Desativar' : 'Ativar'} className="p-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300">
                  {r.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={() => deleteRack(r)} title="Excluir" className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {racks.length === 0 && <p className="text-sm text-gray-600 col-span-full py-8 text-center italic">Nenhum rack cadastrado.</p>}
        </div>
      </section>

      {editingRackId !== null && (() => {
        const rack = racks.find((r) => r.id === editingRackId);
        if (!rack) return null;
        return (
          <RackMinerSlotsModal
            rack={rack}
            onClose={() => setEditingRackId(null)}
            onSaved={(minerSlots) => {
              setRacks((prev) => prev.map((r) => (r.id === rack.id ? { ...r, minerSlots } : r)));
              setEditingRackId(null);
            }}
          />
        );
      })()}

      {editingRackFormId !== null && (() => {
        const rack = racks.find((r) => r.id === editingRackFormId);
        if (!rack) return null;
        return (
          <RackEditModal
            rack={rack}
            onClose={() => setEditingRackFormId(null)}
            onSaved={(updated) => {
              setRacks((prev) => prev.map((r) => (r.id === rack.id ? { ...r, ...updated } : r)));
              setEditingRackFormId(null);
            }}
          />
        );
      })()}
    </div>
  );
}
