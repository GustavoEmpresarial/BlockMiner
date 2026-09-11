import { useEffect, useState } from 'react';
import { Clock, Loader2, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, useAuthStore } from '../../shared/auth/auth.store';
import { ChannelAvatar } from './components/ChannelAvatar';
import { PartnerBenefits } from './components/PartnerBenefits';
import {
  CredentialRequestForm,
  EditProfileForm,
  MySubmissions,
  SubmitForm,
} from './components/creator.forms';
import type { YoutuberProfile } from './creator.types';

export function CredentialTab() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<YoutuberProfile | null | undefined>(undefined);
  const [submissionsRefresh, setSubmissionsRefresh] = useState(0);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const res = await api.get<{ ok: boolean; profile: YoutuberProfile | null }>('/social/my-profile');
        setProfile(res.data.ok ? res.data.profile : null);
      } catch {
        setProfile(null);
      }
    })();
  }, [user]);

  const isCredentialed = profile?.isCredentialed === true;
  const isPending = !isCredentialed && profile?.credentialRequestStatus === 'pending';
  const isRejected = !isCredentialed && profile?.credentialRequestStatus === 'rejected';
  const hasNoRequest = !isCredentialed && !isPending && !isRejected;

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-600">
        <Star className="w-10 h-10 opacity-30" />
        <p className="text-sm font-bold">{t('ranking.social.login_required')}</p>
      </div>
    );
  }

  if (profile === undefined) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
          <Star className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-black text-white">{t('ranking.social.creator_area')}</p>
          <p className="text-[10px] text-gray-500">{t('ranking.social.creator_area_sub')}</p>
        </div>
      </div>

      <PartnerBenefits />

      {isCredentialed && profile ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-950/10 px-4 py-3">
            <ChannelAvatar photo={profile.channelPhoto} name={profile.channelName} />
            <div className="flex-1">
              <p className="text-sm font-black text-white">{profile.channelName}</p>
              <p className="text-[10px] text-red-400">{t('ranking.creator_badge')}</p>
            </div>
          </div>
          <EditProfileForm profile={profile} onSaved={(p) => setProfile(p)} />
          <SubmitForm onSubmitted={() => setSubmissionsRefresh((n) => n + 1)} />
          <MySubmissions refreshToken={submissionsRefresh} />
        </div>
      ) : null}

      {isPending ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-4">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white">{t('ranking.social.pending_title')}</p>
            <p className="text-xs text-amber-400/70">{t('ranking.social.pending_sub')}</p>
          </div>
        </div>
      ) : null}

      {isRejected ? (
        <CredentialRequestForm profile={profile} onRequested={(p) => setProfile(p)} />
      ) : null}

      {hasNoRequest ? (
        <CredentialRequestForm profile={null} onRequested={(p) => setProfile(p)} />
      ) : null}
    </div>
  );
}
