import { useState, useRef, type MouseEvent } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { ChannelAvatar as BaseChannelAvatar } from '../../creator/components/ChannelAvatar';
import { readAxiosResponseMessage } from '../lib/admin.api';
import type {
  AdminSocialTab,
  CreatorUser,
  Profile,
  ProfileUser,
  RewardMiner,
  Submission,
} from './creators.types';
import * as creatorsApi from './creators.api';

// Re-export for compatibility
export type { AdminSocialTab, ProfileUser, Profile, Submission, RewardMiner };
export type SearchUser = CreatorUser;

export const STATUS_CFG: Record<
  string,
  { label: string; cls: string; icon: typeof Clock }
> = {
  pending: {
    label: 'Pendente',
    cls: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    icon: Clock,
  },
  approved: {
    label: 'Aprovado',
    cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    icon: CheckCircle2,
  },
  rejected: {
    label: 'Recusado',
    cls: 'bg-red-500/15 text-red-300 border-red-500/25',
    icon: XCircle,
  },
};

const AVATAR_SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-7 h-7 text-[10px] rounded-lg',
  md: 'w-10 h-10 text-sm rounded-xl',
  lg: 'w-12 h-12 text-base rounded-xl',
};

export function ChannelAvatar({
  photo,
  name,
  size = 'md',
}: {
  photo?: string | null;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (size === 'md') {
    return <BaseChannelAvatar photo={photo} name={name} />;
  }
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={`${AVATAR_SIZE[size]} object-cover border border-white/10 shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${AVATAR_SIZE[size]} bg-red-500/20 flex items-center justify-center font-black text-red-300 shrink-0`}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

export function RejectModal({
  submission,
  onClose,
  onRejected,
}: {
  submission: Submission;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReject = async () => {
    setLoading(true);
    try {
      await creatorsApi.rejectSubmission(submission.id, note);
      toast.success('Vídeo recusado com sucesso.');
      onRejected();
      onClose();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao recusar vídeo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <p className="font-black text-white">Recusar vídeo</p>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-400 truncate">{submission.title ?? submission.videoUrl}</p>
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
              Motivo (opcional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Explique o motivo da recusa..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 resize-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleReject()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-sm font-black text-white transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}

export function AddProfileModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CreatorUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CreatorUser | null>(null);
  const [channelName, setChannelName] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const users = await creatorsApi.searchCreators(q);
        setResults(users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSave = async () => {
    if (!selected || !channelName.trim()) return;
    setSaving(true);
    try {
      await creatorsApi.createProfile({
        userId: selected.id,
        channelName: channelName.trim(),
        channelUrl: channelUrl.trim() || undefined,
        bio: bio.trim() || undefined,
        isCredentialed: true,
      });
      toast.success('Perfil criado com sucesso.');
      onAdded();
      onClose();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao criar perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
        onClick={(e: MouseEvent) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <p className="font-black text-white">Adicionar criador</p>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!selected ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/50 placeholder:text-slate-600"
                placeholder="Buscar username..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  search(e.target.value);
                }}
              />
            </div>
            {searching ? <p className="text-xs text-slate-500 text-center">Buscando...</p> : null}
            {results.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => {
                  setSelected(u);
                  setChannelName(u.username || '');
                  setChannelUrl(u.youtubeUrl || '');
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-800 text-left"
              >
                <span className="text-sm font-bold text-white">{u.username}</span>
                <span className="text-xs text-slate-500">{u.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded-xl">
              <span className="text-sm font-black text-white">@{selected.username}</span>
              <button type="button" onClick={() => setSelected(null)} className="text-slate-500 hover:text-white" aria-label="Limpar seleção">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/50"
              placeholder="Nome do canal"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
            <input
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/50"
              placeholder="https://youtube.com/@canal"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
            />
            <textarea
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/50 resize-none"
              placeholder="Bio (opcional)"
              rows={2}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !channelName.trim()}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Salvando...' : 'Criar perfil'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function EditProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [channelName, setChannelName] = useState(profile.channelName);
  const [channelUrl, setChannelUrl] = useState(profile.channelUrl ?? '');
  const [channelPhoto, setChannelPhoto] = useState(profile.channelPhoto ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [isCredentialed, setIsCredentialed] = useState(profile.isCredentialed);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!channelName.trim()) return;
    setSaving(true);
    try {
      await creatorsApi.updateProfile(profile.id, {
        channelName: channelName.trim(),
        channelUrl: channelUrl.trim() || null,
        channelPhoto: channelPhoto.trim() || null,
        bio: bio.trim() || null,
        isCredentialed,
      });
      toast.success('Perfil atualizado com sucesso.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="font-black text-white">Editar perfil</p>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white"
          value={channelName}
          onChange={(e) => setChannelName(e.target.value)}
          placeholder="Nome do canal"
        />
        <input
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white"
          value={channelUrl}
          onChange={(e) => setChannelUrl(e.target.value)}
          placeholder="URL do canal"
        />
        <input
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white"
          value={channelPhoto}
          onChange={(e) => setChannelPhoto(e.target.value)}
          placeholder="URL da foto"
        />
        <textarea
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white resize-none"
          rows={2}
          maxLength={500}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Bio"
        />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={isCredentialed}
            onChange={(e) => setIsCredentialed(e.target.checked)}
          />
          Credenciado
        </label>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !channelName.trim()}
          className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-sm disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
