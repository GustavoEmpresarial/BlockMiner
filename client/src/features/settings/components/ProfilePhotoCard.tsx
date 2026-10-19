import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Camera, Loader2, ShieldAlert, Trash2, Upload } from 'lucide-react';
import SectionHeader from '../../../shared/components/SectionHeader';
import UserAvatar from '../../../shared/components/UserAvatar';
import { useMyAvatar } from '../../../shared/hooks/useMyAvatar';
import AvatarLicensePurchase from './AvatarLicensePurchase';
import { avatarErrorCode, deleteAvatarPhoto, fetchAvatarStatus, uploadAvatarPhoto, type AvatarStatus } from '../lib/avatar.api';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const RENEW_SOON_MS = 30 * 86_400_000;

export type ProfilePhotoState = 'loading' | 'blocked' | 'no_license' | 'active' | 'expiring' | 'expired';

export function profilePhotoState(status: AvatarStatus | null, now = Date.now()): ProfilePhotoState {
  if (!status) return 'loading';
  if (status.uploadBlocked) return 'blocked';
  const exp = status.licenseExpiresAt ? Date.parse(status.licenseExpiresAt) : NaN;
  if (!status.licenseActive) return Number.isFinite(exp) ? 'expired' : 'no_license';
  return exp - now <= RENEW_SOON_MS ? 'expiring' : 'active';
}

type Props = { displayName: string };

export function formatUsd(v: number): string {
  return `US$ ${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

export default function ProfilePhotoCard({ displayName }: Props) {
  const { t, i18n } = useTranslation();
  const setMyAvatar = useMyAvatar((s) => s.setAvatarUrl);
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const errorText = useCallback(
    (err: unknown) => {
      const code = avatarErrorCode(err);
      return code ? t(`profilePhoto.errors.${code}`, { defaultValue: t('profilePhoto.errors.generic') }) : t('profilePhoto.errors.generic');
    },
    [t],
  );

  const refresh = useCallback(async () => {
    try {
      const s = await fetchAvatarStatus();
      setStatus(s);
      setMyAvatar(s.avatarUrl);
    } catch {
      setStatus((prev) => prev);
    }
  }, [setMyAvatar]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state = profilePhotoState(status);
  const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language || 'en') : '');
  const canBuy = state === 'no_license' || state === 'expired' || (state === 'expiring' && Boolean(status?.canRenew));
  const settingsPrice = status?.prices?.settings ?? status?.priceUsd ?? 1.5;
  const offersPrice = status?.prices?.offers ?? 1;

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    if (file.size > MAX_BYTES) {
      toast.error(t('profilePhoto.errors.AVATAR_UPLOAD_TOO_LARGE'));
      return;
    }
    setBusy('upload');
    try {
      const res = await uploadAvatarPhoto(file);
      setMyAvatar(res.avatarUrl);
      toast.success(t('profilePhoto.uploaded'));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
      await refresh();
    }
  }

  async function handleRemove() {
    if (busy) return;
    setBusy('remove');
    try {
      await deleteAvatarPhoto();
      setMyAvatar(null);
      toast.success(t('profilePhoto.removed'));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  return (
    <div className="bg-slate-900/60 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-[4px_4px_0px_#000000] space-y-5" data-testid="profile-photo-card" data-state={state}>
      <SectionHeader icon={Camera} iconVariant="sky" title={t('profilePhoto.title')} />
      <div className="flex items-center gap-4">
        <UserAvatar
          url={status?.avatarUrl}
          name={displayName}
          className="h-20 w-20 rounded-2xl border-2 border-slate-700 bg-slate-950 shadow-[2px_2px_0px_#000000]"
          letterClassName="text-3xl font-black text-slate-300"
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-slate-300">{t('profilePhoto.subtitle')}</p>
          {state === 'active' && <p className="text-xs font-bold text-emerald-400">{t('profilePhoto.active_until', { date: formatDate(status!.licenseExpiresAt) })}</p>}
          {state === 'expiring' && <p className="text-xs font-bold text-amber-400">{t('profilePhoto.expires_soon', { date: formatDate(status!.licenseExpiresAt) })}</p>}
          {state === 'expired' && <p className="text-xs font-bold text-red-400">{t('profilePhoto.expired_on', { date: formatDate(status!.licenseExpiresAt) })}</p>}
        </div>
      </div>

      {state === 'loading' && <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="loading" />}

      {state === 'blocked' && (
        <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs font-bold text-red-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {t('profilePhoto.blocked')}
        </p>
      )}

      {canBuy && status && (
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div>
            <p className="text-sm font-black text-white">{t('profilePhoto.license_price', { price: formatUsd(settingsPrice) })}</p>
            <p className="text-[11px] text-slate-400">{t('profilePhoto.license_hint')}</p>
          </div>
          <Link
            to="/offers"
            data-testid="avatar-offers-link"
            className="block rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
          >
            {t('profilePhoto.cheaper_in_offers', { price: formatUsd(offersPrice) })}
          </Link>
          <AvatarLicensePurchase
            status={status}
            channel="settings"
            ctaLabel={state === 'expiring' ? t('profilePhoto.renew') : t('profilePhoto.buy')}
            onDone={refresh}
          />
        </div>
      )}

      {(state === 'active' || state === 'expiring') && (
        <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            data-testid="avatar-file"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy != null}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy === 'upload' ? t('profilePhoto.uploading') : status?.avatarUrl ? t('profilePhoto.change') : t('profilePhoto.upload')}
            </button>
            {status?.avatarUrl && (
              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={busy != null}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-700 bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-300 hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
              >
                {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t('profilePhoto.remove')}
              </button>
            )}
          </div>
          <p className="text-[10px] font-medium text-slate-500">{t('profilePhoto.upload_hint')}</p>
        </div>
      )}
    </div>
  );
}
