import { useState, useRef, type ChangeEvent, type DragEvent, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { X, Save, Upload, Loader2, ToggleLeft, ToggleRight, Film, Image as ImageIcon } from 'lucide-react';
import { BANNER_TYPES, EMPTY_BANNER_FORM, type BannerFormState, type BannerTypeValue } from '../banners.types';
import { isVideoMediaUrl, resolveBannerMediaUrl } from '../banners.shared';
import { uploadBannerMedia } from '../banners.api';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export interface BannerFormProps {
  initial?: BannerFormState;
  onSave: (form: BannerFormState) => void | Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export function BannerForm({ initial, onSave, onCancel, isSaving }: BannerFormProps) {
  const [form, setForm] = useState<BannerFormState>(() => initial ?? EMPTY_BANNER_FORM);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof BannerFormState>(k: K, v: BannerFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const processFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error('O arquivo excede o limite máximo permitido de 100 MB.');
      return;
    }
    const isImg = file.type.startsWith('image/');
    const isVid = file.type.startsWith('video/');
    if (!isImg && !isVid) {
      toast.error('Formato não suportado. Envie uma imagem (PNG, JPG, WebP, GIF) ou vídeo (MP4, WebM).');
      return;
    }

    setUploading(true);
    try {
      const url = await uploadBannerMedia(file);
      set('imageUrl', url);
      toast.success(isVid ? 'Vídeo enviado do navegador!' : 'Imagem enviada do navegador!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar arquivo.';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    // Reset file input value so re-selecting the same file fires change event
    e.target.value = '';
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const resolvedUrl = resolveBannerMediaUrl(form.imageUrl);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upload de Mídia pelo Navegador */}
        <div className="md:col-span-2 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
            <span>Mídia do Banner (Envio do Computador)</span>
            {resolvedUrl ? (
              <span className="text-[11px] font-mono text-slate-500 truncate max-w-[280px]">
                {resolvedUrl}
              </span>
            ) : null}
          </label>

          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileInputChange}
          />

          {!resolvedUrl ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !uploading && fileRef.current?.click()}
              className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                isDragging
                  ? 'border-amber-500 bg-amber-500/10 scale-[1.01]'
                  : 'border-slate-700 hover:border-amber-500/50 bg-slate-950/70 hover:bg-slate-950'
              } ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3 text-amber-400">
                {uploading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
              </div>
              <p className="text-sm font-bold text-white mb-1 text-center">
                {uploading
                  ? 'Enviando arquivo do navegador para o servidor…'
                  : 'Clique para selecionar arquivo do computador ou arraste aqui'}
              </p>
              <p className="text-xs text-slate-500 text-center flex items-center gap-1.5 flex-wrap justify-center">
                <span className="flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5" /> PNG, JPG, GIF, WebP
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Film className="w-3.5 h-3.5" /> MP4, WebM
                </span>
                <span>•</span>
                <span>máx. 100 MB</span>
              </p>
            </div>
          ) : (
            <div
              className="relative w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner group"
              style={{ aspectRatio: '16/9' }}
            >
              {isVideoMediaUrl(resolvedUrl) ? (
                <video
                  src={resolvedUrl}
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : (
                <img
                  src={resolvedUrl}
                  alt="preview"
                  className="w-full h-full object-cover"
                  onError={(ev: SyntheticEvent<HTMLImageElement>) => {
                    ev.currentTarget.style.display = 'none';
                  }}
                />
              )}

              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/80 hover:bg-black text-amber-400 border border-amber-500/30 text-xs font-bold transition-all shadow-lg backdrop-blur-sm"
                  title="Substituir por outro arquivo"
                >
                  {uploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  Substituir Arquivo
                </button>

                <button
                  type="button"
                  onClick={() => set('imageUrl', '')}
                  className="w-8 h-8 rounded-xl bg-black/80 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-lg border border-slate-700/50 hover:border-red-500/50 backdrop-blur-sm"
                  title="Remover mídia"
                  aria-label="Remover mídia"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Título *
          </label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Título do banner"
            maxLength={120}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Descrição (opcional)
          </label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
            placeholder="Texto adicional explicativo"
            maxLength={500}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
          <select
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.type}
            onChange={(e) => set('type', e.target.value as BannerTypeValue)}
          >
            {BANNER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 flex flex-col justify-end">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status Inicial</label>
          <button
            type="button"
            onClick={() => set('isActive', !form.isActive)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors ${
              form.isActive
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
          >
            {form.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {form.isActive ? 'Ativo' : 'Inativo'}
          </button>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Link ao clicar (opcional)
          </label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.link}
            onChange={(e) => set('link', e.target.value)}
            placeholder="https://... ou rota interna /shop"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Texto do Botão / Ação (opcional)
          </label>
          <input
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.linkLabel}
            onChange={(e) => set('linkLabel', e.target.value)}
            placeholder="Ex.: Saiba mais, Conheça, Aproveitar"
            maxLength={60}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Início da exibição (UTC)
          </label>
          <input
            type="datetime-local"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.startsAt}
            onChange={(e) => set('startsAt', e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Fim da oferta / Countdown (UTC)
          </label>
          <input
            type="datetime-local"
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50"
            value={form.endsAt}
            onChange={(e) => set('endsAt', e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => void onSave(form)}
          disabled={isSaving || uploading || !form.title.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm transition-colors disabled:opacity-40"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 font-bold text-sm transition-colors"
        >
          <X className="w-4 h-4" />
          Cancelar
        </button>
      </div>
    </div>
  );
}
