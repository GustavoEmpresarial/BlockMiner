import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Camera, Loader2, ShieldAlert, Trash2, Upload } from 'lucide-react';
import SectionHeader from '../../../shared/components/SectionHeader';
import UserAvatar from '../../../shared/components/UserAvatar';
import { useMyAvatar } from '../../../shared/hooks/useMyAvatar';
import {
  avatarErrorCode,
  deleteAvatarPhoto,
  fetchAvatarStatus,
  newIdempotencyKey,
  purchaseAvatarLicense,
  uploadAvatarPhoto,
  type AvatarCurrency,
  type AvatarStatus,
} from '../lib/avatar.api';

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

export default function ProfilePhotoCard({ displayName }: Props) {
  const { t, i18n } = useTranslation();
  const setMyAvatar = useMyAvatar((s) => s.setAvatarUrl);
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [currency, setCurrency] = useState<AvatarCurrency>('POL');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'buy' | 'upload' | 'remove' | null>(null);
  const attemptKey = useRef<string | null>(null);
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
  const quote = status?.quotes.find((q) => q.currency === currency) ?? null;
  const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language || 'en') : '');
  const canBuy = state === 'no_license' || state === 'expired' || (state === 'expiring' && Boolean(status?.canRenew));
  const hasBalance = quote?.amount != null && Number(quote.balance) >= Number(quote.amount);

  async function handleBuy() {
    if (!quote?.amount || busy) return;
    if (!confirming) {
      attemptKey.current = newIdempotencyKey();
      setConfirming(true);
      return;
    }
    setBusy('buy');
    try {
      await purchaseAvatarLicense(currency, quote.amount, attemptKey.current ?? newIdempotencyKey());
      toast.success(t('profilePhoto.purchased'));
      setConfirming(false);
      attemptKey.current = null;
    } catch (err) {
      toast.error(errorText(err));
      if (avatarErrorCode(err) === 'AVATAR_QUOTE_CHANGED') attemptKey.current = newIdempotencyKey();
    } finally {
      setBusy(null);
      await refresh();
    }
  }

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
            <p className="text-sm font-black text-white">{t('profilePhoto.license_price')}</p>
            <p className="text-[11px] text-slate-400">{t('profilePhoto.license_hint')}</p>
          </div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400" htmlFor="avatar-currency">
            {t('profilePhoto.pay_with')}
          </label>
          <select
            id="avatar-currency"
            value={currency}
            disabled={busy != null}
            onChange={(e) => {
              setCurrency(e.target.value as AvatarCurrency);
              setConfirming(false);
            }}
            className="w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-white focus:border-primary focus:outline-none"
          >
            {status.quotes.map((q) => (
              <option key={q.currency} value={q.currency}>
                {q.currency}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">{t('profilePhoto.amount')}</span>
              <span className="font-mono font-bold text-white" data-testid="avatar-amount">
                {quote?.amount ? `${quote.amount} ${currency}` : t('profilePhoto.price_unavailable')}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500">{t('profilePhoto.your_balance')}</span>
              <span className={`font-mono font-bold ${hasBalance ? 'text-slate-200' : 'text-red-400'}`}>{quote ? `${quote.balance} ${currency}` : '-'}</span>
            </div>
          </div>
          {confirming && quote?.amount && (
            <p className="text-xs font-bold text-amber-300" data-testid="avatar-confirm">
              {t('profilePhoto.confirm_buy', { amount: quote.amount, currency })}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleBuy()}
              disabled={busy != null || !quote?.amount || !hasBalance}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] transition-all hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {busy === 'buy' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy === 'buy' ? t('profilePhoto.buying') : confirming ? t('common.confirm') : state === 'expiring' ? t('profilePhoto.renew') : t('profilePhoto.buy')}
            </button>
            {confirming && (
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy != null}
                className="rounded-xl border-2 border-slate-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white"
              >
                {t('common.cancel')}
              </button>
            )}
          </div>
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
