import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { isAxiosError } from 'axios';
import { Upload, X, Link2, Image } from 'lucide-react';
import { api } from '../auth/auth.store';

function readUploadErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message?: unknown }).message;
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
    if (typeof err.response?.status === 'number') {
      return `Erro ${err.response.status} ao enviar imagem.`;
    }
    return 'Erro ao enviar imagem (sem resposta).';
  }
  return 'Erro ao enviar imagem (sem resposta).';
}

type ImageUploaderProps = {
  value: string | null | undefined;
  onChange: (url: string) => void;
  label?: string;
  previewClass?: string;
};

/** Admin image upload (file or URL) → POST `/admin/upload-image`. */
export default function ImageUploader({
  value,
  onChange,
  label = 'Imagem',
  previewClass = 'max-h-40',
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const uploadFromFile = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const res = await api.post<{ ok?: boolean; url?: string; message?: string }>('/admin/upload-image', form);
      if (res.data.ok && typeof res.data.url === 'string') {
        onChange(res.data.url);
      } else {
        setError(typeof res.data.message === 'string' ? res.data.message : 'Erro no upload.');
      }
    } catch (err: unknown) {
      setError(readUploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFromFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFromFile(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase text-slate-500">{label}</label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase transition-all ${mode === 'upload' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            <Upload className="h-3 w-3" /> Upload
          </button>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase transition-all ${mode === 'url' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
          >
            <Link2 className="h-3 w-3" /> URL
          </button>
        </div>
      </div>

      {mode === 'upload' ? (
        <div
          className="relative cursor-pointer rounded-xl border-2 border-dashed border-slate-700 p-6 text-center transition-colors hover:border-primary/60"
          onDragOver={(ev) => ev.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => void handleFile(e)}
          />
          {uploading ? (
            <p className="animate-pulse text-xs font-bold text-primary">Enviando...</p>
          ) : (
            <>
              <Image className="mx-auto mb-2 h-8 w-8 text-slate-600" />
              <p className="text-xs font-medium text-slate-400">Clique ou arraste uma imagem aqui</p>
              <p className="mt-1 text-[10px] text-slate-600">JPG, PNG, GIF, WEBP, SVG — máx 5 MB</p>
            </>
          )}
        </div>
      ) : (
        <input
          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white focus:border-primary/50 focus:outline-none"
          placeholder="https://..."
          value={value || ''}
          onChange={(ev) => onChange(ev.target.value)}
        />
      )}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      {value ? (
        <div className="relative inline-block">
          <img src={value} alt="" className={`${previewClass} block rounded-xl border border-slate-800`} />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 transition-colors hover:bg-red-400"
          >
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
