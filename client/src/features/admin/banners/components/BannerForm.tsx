import { useState, useRef, type ChangeEvent, type SyntheticEvent } from 'react';
import { toast } from 'sonner';
import { X, Save, Upload, ToggleLeft, ToggleRight } from 'lucide-react';
import { BANNER_TYPES, EMPTY_BANNER_FORM, type BannerFormState, type BannerTypeValue } from '../banners.types';
import { isVideoMediaUrl, resolveBannerMediaUrl } from '../banners.shared';
import { uploadBannerMedia } from '../banners.api';

export interface BannerFormProps {
  initial?: BannerFormState;
  onSave: (form: BannerFormState) => void | Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export function BannerForm({ initial, onSave, onCancel, isSaving }: BannerFormProps) {
  const [form, setForm] = useState<BannerFormState>(() => initial ?? EMPTY_BANNER_FORM);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const set = <K extends keyof BannerFormState>(k: K, v: BannerFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadBannerMedia(file);
      set('imageUrl', url);
      toast.success(file.type.startsWith('video/') ? 'Vídeo enviado!' : 'Imagem enviada!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar arquivo.';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const resolvedUrl = resolveBannerMediaUrl(form.imageUrl);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Mídia do Banner
          </label>

          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
              value={form.imageUrl}
              onChange={(e) => set('imageUrl', e.target.value)}
              placeholder="Cole a URL da imagem (https://...) ou envie um arquivo →"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-700 hover:border-amber-500/50 text-slate-400 hover:text-amber-400 text-xs font-bold transition-colors disabled:opacity-40"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Enviando…' : 'Upload'}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleUpload}
          />

          {resolvedUrl ? (
            <div
              className="relative w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800"
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
              <button
                type="button"
                onClick={() => set('imageUrl', '')}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 hover:bg-red-500/80 text-white flex items-center justify-center transition-colors"
                title="Remover mídia"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : null}
          <p className="text-[10px] text-slate-600">
            Upload: PNG, JPG, GIF, WebP, MP4, WebM · máx 100 MB &nbsp;|&nbsp; URL: qualquer imagem HTTPS
          </p>
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
