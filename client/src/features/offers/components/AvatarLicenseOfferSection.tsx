import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Camera } from 'lucide-react';
import { IconBadge, StatusPill } from '../../../shared/components';
import AvatarLicensePurchase from '../../settings/components/AvatarLicensePurchase';
import { formatUsd, profilePhotoState } from '../../settings/components/ProfilePhotoCard';
import { fetchAvatarStatus, type AvatarStatus } from '../../settings/lib/avatar.api';
import { useMyAvatar } from '../../../shared/hooks/useMyAvatar';
import { useAuthStore } from '../../../shared/auth/auth.store';
import { LicenseCertificate } from './LicenseCertificate';

/** Profile-photo license at the Offers price (US$ 1); Settings sells it at US$ 1.50. */
export function AvatarLicenseOfferSection() {
  const { t, i18n } = useTranslation();
  const setMyAvatar = useMyAvatar((s) => s.setAvatarUrl);
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await fetchAvatarStatus();
      setStatus(s);
      setMyAvatar(s.avatarUrl);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [setMyAvatar]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (failed || !status) return null;
  const state = profilePhotoState(status);
  const offersPrice = status.prices?.offers ?? 1;
  const settingsPrice = status.prices?.settings ?? 1.5;
  const canBuy = state === 'no_license' || state === 'expired' || (state === 'expiring' && status.canRenew);
  const until = status.licenseExpiresAt ? new Date(status.licenseExpiresAt).toLocaleDateString(i18n.language || 'en') : '';

  return (
    <div className="space-y-6" data-testid="avatar-license-offer" data-state={state}>
      <div className="flex items-center gap-3 pb-3 border-b-2 border-slate-800">
        <IconBadge icon={Camera} variant="sky" size="md" />
        <h2 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tight">{t('profilePhoto.offer_title')}</h2>
        <StatusPill variant="success" label={t('offers.live', { defaultValue: 'Ao Vivo' })} />
      </div>
      <div className="grid grid-cols-1 gap-6 rounded-3xl border-2 border-sky-500/40 bg-slate-900/80 p-6 shadow-[4px_4px_0px_#000000] md:grid-cols-[1fr_1fr_200px]">
        <LicenseCertificate
          className="md:order-last"
          holder={state === 'active' || state === 'expiring' ? String(user?.username || user?.name || '') || null : null}
          validUntil={state === 'active' || state === 'expiring' ? until : null}
        />
        <div className="space-y-3">
          <p className="text-sm text-slate-300">{t('profilePhoto.offer_description')}</p>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black text-white" data-testid="avatar-offer-price">{formatUsd(offersPrice)}</span>
            <span className="text-sm font-bold text-slate-500 line-through">{formatUsd(settingsPrice)}</span>
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">{t('profilePhoto.per_year')}</span>
          </div>
          <p className="text-[11px] text-slate-400">{t('profilePhoto.license_hint')}</p>
        </div>
        <div>
          {state === 'blocked' && <p className="text-xs font-bold text-red-300">{t('profilePhoto.blocked')}</p>}
          {canBuy && (
            <AvatarLicensePurchase
              status={status}
              channel="offers"
              ctaLabel={state === 'expiring' ? t('profilePhoto.renew') : t('profilePhoto.buy')}
              onDone={refresh}
            />
          )}
          {!canBuy && state !== 'blocked' && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-emerald-400">{t('profilePhoto.active_until', { date: until })}</p>
              <Link
                to="/settings"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] hover:bg-blue-700"
              >
                {t('profilePhoto.go_to_settings')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
