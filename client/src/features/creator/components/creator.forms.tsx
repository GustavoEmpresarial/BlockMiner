import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Save,
  Send,
  Star,
  XCircle,
  Youtube,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { api } from '../../../shared/auth/auth.store';
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from '../creator.constants';
import { uploadChannelPhoto } from '../creator.upload';
import type { Submission, YoutuberProfile } from '../creator.types';

function useSubmissionStatusStyles() {
  const { t } = useTranslation();
  return {
    pending: {
      label: t('ranking.social.status_pending'),
      cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      icon: Clock,
    },
    approved: {
      label: t('ranking.social.status_approved'),
      cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      icon: CheckCircle2,
    },
    rejected: {
      label: t('ranking.social.status_rejected'),
      cls: 'text-red-400 bg-red-500/10 border-red-500/20',
      icon: XCircle,
    },
  } as const;
}

export function CredentialRequestForm({
  profile,
  onRequested,
}: {
  profile: YoutuberProfile | null;
  onRequested: (p: YoutuberProfile) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [channelName, setChannelName] = useState(profile?.channelName ?? '');
  const [channelUrl, setChannelUrl] = useState(profile?.channelUrl ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(profile?.channelPhoto ?? null);
  const [channelPhoto, setChannelPhoto] = useState<string | null>(profile?.channelPhoto ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRejected = profile?.credentialRequestStatus === 'rejected';

  useEffect(() => {
    setChannelName(profile?.channelName ?? '');
    setChannelUrl(profile?.channelUrl ?? '');
    setBio(profile?.bio ?? '');
    setPreviewUrl(profile?.channelPhoto ?? null);
    setChannelPhoto(profile?.channelPhoto ?? null);
  }, [profile?.id, profile?.channelName, profile?.channelUrl, profile?.bio, profile?.channelPhoto]);

  const onPhotoPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setFormError(t('ranking.social.invalid_format'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setFormError(t('ranking.social.photo_too_large'));
      return;
    }
    setFormError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadingPhoto(true);
    try {
      const url = await uploadChannelPhoto(file);
      if (!url) {
        setFormError(t('ranking.social.photo_upload_error'));
        setPreviewUrl(profile?.channelPhoto ?? null);
        setChannelPhoto(profile?.channelPhoto ?? null);
        return;
      }
      setChannelPhoto(url);
    } catch {
      setFormError(t('ranking.social.photo_upload_error'));
      setPreviewUrl(profile?.channelPhoto ?? null);
      setChannelPhoto(profile?.channelPhoto ?? null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!channelName.trim()) {
      setFormError(t('common.error'));
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ ok?: boolean; profile?: YoutuberProfile }>('/social/request-credential', {
        channelName: channelName.trim(),
        channelUrl: channelUrl.trim() || undefined,
        channelPhoto: channelPhoto ?? undefined,
        bio: bio.trim() || undefined,
      });
      if (res.data?.ok && res.data.profile) {
        toast.success(t('ranking.social.submit_request'));
        onRequested(res.data.profile);
      }
    } catch (err) {
      const msg = isAxiosError(err) ? err.response?.data : null;
      setFormError(
        typeof msg === 'object' && msg && 'message' in msg
          ? String((msg as { message: string }).message)
          : t('ranking.social.request_error'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Star className="w-4 h-4 text-red-400" />
        <p className="text-sm font-black text-white">
          {isRejected ? t('ranking.social.resubmit_title') : t('ranking.social.request_title')}
        </p>
      </div>
      <p className="text-xs text-gray-500">{t('ranking.social.request_hint')}</p>

      {isRejected && profile?.credentialRejectNote ? (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-xs mb-0.5">{t('ranking.social.rejected_before')}</p>
            <p className="text-xs">{profile.credentialRejectNote}</p>
          </div>
        </div>
      ) : null}

      {formError ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {formError}
        </div>
      ) : null}

      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            {t('ranking.social.channel_name')}
          </label>
          <input
            type="text"
            value={channelName}
            onChange={(ev) => setChannelName(ev.target.value)}
            placeholder={t('ranking.social.channel_name_placeholder')}
            required
            maxLength={100}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            {t('ranking.social.channel_url')}
          </label>
          <input
            type="url"
            value={channelUrl}
            onChange={(ev) => setChannelUrl(ev.target.value)}
            placeholder={t('ranking.social.channel_url_placeholder')}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            {t('ranking.social.channel_photo')}
          </label>
          <div className="flex items-center gap-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Youtube className="w-5 h-5 text-gray-600" />
              </div>
            )}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {uploadingPhoto ? t('ranking.social.uploading_photo') : t('ranking.social.choose_photo')}
              </button>
              <p className="text-[10px] text-gray-600 mt-1">{t('ranking.social.photo_hint')}</p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_PHOTO_TYPES.join(',')}
            className="hidden"
            onChange={(ev) => void onPhotoPick(ev)}
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            {t('ranking.social.channel_about_optional')}
          </label>
          <textarea
            value={bio}
            onChange={(ev) => setBio(ev.target.value)}
            placeholder={t('ranking.social.channel_about_placeholder')}
            rows={2}
            maxLength={500}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-red-500/50 resize-none min-h-[80px]"
          />
        </div>

        <button
          type="submit"
          disabled={busy || uploadingPhoto || !channelName.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-black text-white transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isRejected ? t('ranking.social.resubmit_request') : t('ranking.social.submit_request')}
        </button>
      </form>
    </div>
  );
}

export function EditProfileForm({
  profile,
  onSaved,
}: {
  profile: YoutuberProfile;
  onSaved: (p: YoutuberProfile) => void;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [channelName, setChannelName] = useState(profile.channelName ?? '');
  const [channelUrl, setChannelUrl] = useState(profile.channelUrl ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(profile.channelPhoto ?? null);
  const [channelPhoto, setChannelPhoto] = useState<string | null>(profile.channelPhoto ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setChannelName(profile.channelName ?? '');
    setChannelUrl(profile.channelUrl ?? '');
    setBio(profile.bio ?? '');
    setPreviewUrl(profile.channelPhoto ?? null);
    setChannelPhoto(profile.channelPhoto ?? null);
  }, [profile.id, profile.channelName, profile.channelUrl, profile.bio, profile.channelPhoto]);

  const onPhotoPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setFormError(t('ranking.social.invalid_format'));
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setFormError(t('ranking.social.photo_too_large'));
      return;
    }
    setFormError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadingPhoto(true);
    try {
      const url = await uploadChannelPhoto(file);
      if (!url) {
        setFormError(t('ranking.social.photo_upload_error'));
        setPreviewUrl(profile.channelPhoto ?? null);
        setChannelPhoto(profile.channelPhoto ?? null);
        return;
      }
      setChannelPhoto(url);
    } catch {
      setFormError(t('ranking.social.photo_upload_error'));
      setPreviewUrl(profile.channelPhoto ?? null);
      setChannelPhoto(profile.channelPhoto ?? null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSavedFlash(false);
    setBusy(true);
    try {
      const res = await api.put<{ ok?: boolean; profile?: YoutuberProfile }>('/social/my-profile', {
        channelName: channelName.trim(),
        channelUrl: channelUrl.trim(),
        channelPhoto,
        bio: bio.trim(),
      });
      if (res.data?.ok && res.data.profile) {
        onSaved(res.data.profile);
        setSavedFlash(true);
      }
    } catch (err) {
      const msg = isAxiosError(err) ? err.response?.data : null;
      setFormError(
        typeof msg === 'object' && msg && 'message' in msg
          ? String((msg as { message: string }).message)
          : t('ranking.social.save_profile_error'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-white hover:border-white/20 transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
        {t('ranking.social.edit_profile_title')}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-950/10 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-violet-400" />
          <p className="text-sm font-black text-white">{t('ranking.social.edit_profile_title')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setFormError(null);
            setSavedFlash(false);
          }}
          className="text-[10px] text-gray-500 hover:text-gray-300 font-bold"
        >
          {t('common.close')}
        </button>
      </div>

      <p className="text-xs text-gray-500">{t('ranking.social.edit_hint')}</p>

      {savedFlash ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {t('ranking.social.profile_updated')}
        </div>
      ) : null}

      {formError ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {formError}
        </div>
      ) : null}

      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            {t('ranking.social.channel_name')}
          </label>
          <input
            type="text"
            value={channelName}
            onChange={(ev) => setChannelName(ev.target.value)}
            required
            maxLength={100}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50"
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            {t('ranking.social.channel_url')}
          </label>
          <input
            type="url"
            value={channelUrl}
            onChange={(ev) => setChannelUrl(ev.target.value)}
            placeholder={t('ranking.social.channel_url_placeholder')}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50"
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            {t('ranking.social.channel_photo')}
          </label>
          <div className="flex items-center gap-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Youtube className="w-5 h-5 text-gray-600" />
              </div>
            )}
            <div className="flex-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {uploadingPhoto ? t('ranking.social.uploading_photo') : t('ranking.social.change_photo')}
              </button>
              <p className="text-[10px] text-gray-600 mt-1">{t('ranking.social.photo_hint')}</p>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_PHOTO_TYPES.join(',')}
            className="hidden"
            onChange={(ev) => void onPhotoPick(ev)}
          />
        </div>

        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
            {t('ranking.social.channel_about')}
          </label>
          <textarea
            value={bio}
            onChange={(ev) => setBio(ev.target.value)}
            rows={2}
            maxLength={500}
            className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500/50 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={busy || uploadingPhoto || !channelName.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-black text-white transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('ranking.social.save_changes')}
        </button>
      </form>
    </div>
  );
}

export function SubmitForm({ onSubmitted }: { onSubmitted: () => void }) {
  const { t } = useTranslation();
  const [videoUrl, setVideoUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!videoUrl.trim()) return;
    setBusy(true);
    try {
      const res = await api.post('/social/submit', {
        videoUrl: videoUrl.trim(),
        title: title.trim() || undefined,
      });
      if (res.data && typeof res.data === 'object' && 'ok' in res.data && (res.data as { ok?: boolean }).ok) {
        toast.success(t('ranking.social.video_sent'));
        setVideoUrl('');
        setTitle('');
        onSubmitted();
      }
    } catch (err) {
      const msg = isAxiosError(err) ? err.response?.data : null;
      toast.error(
        typeof msg === 'object' && msg && 'message' in msg
          ? String((msg as { message: string }).message)
          : t('ranking.social.video_upload_error'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="rounded-2xl border border-red-500/20 bg-red-950/10 p-4 space-y-3"
    >
      <p className="text-sm font-black text-white">{t('ranking.social.send_video_title')}</p>
      <input
        type="url"
        value={videoUrl}
        onChange={(ev) => setVideoUrl(ev.target.value)}
        placeholder={t('ranking.social.video_url_placeholder')}
        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white"
        required
      />
      <div>
        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1.5">
          {t('ranking.social.video_title_label')}
        </label>
        <input
          value={title}
          onChange={(ev) => setTitle(ev.target.value)}
          placeholder={t('ranking.social.video_title_placeholder')}
          className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-black text-white transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {t('ranking.social.send_for_review')}
      </button>
    </form>
  );
}

export function MySubmissions({ refreshToken }: { refreshToken?: number }) {
  const { t } = useTranslation();
  const statusStyles = useSubmissionStatusStyles();
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await api.get<{ ok?: boolean; submissions?: Submission[] }>('/social/my-submissions');
        if (!cancelled && res.data.ok) setRows(res.data.submissions ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      </div>
    );
  }
  if (!rows.length) return null;

  return (
    <div className="rounded-2xl border border-white/8 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 bg-white/3">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
          {t('ranking.social.my_submissions')}
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((row) => {
          const cfg = statusStyles[row.status] ?? statusStyles.pending;
          const Icon = cfg.icon;
          return (
            <div key={row.id} className="flex items-center gap-3 px-4 py-3">
              <img
                src={`https://img.youtube.com/vi/${row.videoId}/default.jpg`}
                alt=""
                className="w-12 h-9 rounded-lg object-cover shrink-0 border border-white/10"
                onError={(ev) => {
                  ev.currentTarget.style.display = 'none';
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{row.title ?? row.videoUrl}</p>
                {row.reviewNote ? <p className="text-[10px] text-gray-500 mt-0.5">{row.reviewNote}</p> : null}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${cfg.cls}`}
                >
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </span>
                {row.status === 'approved' && row.rewardGranted ? (
                  <span className="text-[10px] text-emerald-400">{t('ranking.social.machine_granted')}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
