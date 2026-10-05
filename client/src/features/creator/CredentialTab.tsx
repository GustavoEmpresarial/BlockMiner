import { useEffect, useState } from 'react';
import { Clock, Loader2, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, useAuthStore } from '../../shared/auth/auth.store';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
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
      <Card className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <IconBadge icon={Star} variant="amber" size="md" />
        <p className="text-sm font-bold text-slate-400">{t('ranking.social.login_required')}</p>
      </Card>
    );
  }

  if (profile === undefined) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PartnerBenefits />

      {isCredentialed && profile ? (
        <div className="space-y-4">
          <Card className="flex items-center gap-3.5 p-4 border-red-500/30 bg-red-950/20 shadow-[2px_2px_0px_#000000]">
            <ChannelAvatar photo={profile.channelPhoto} name={profile.channelName} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white truncate">{profile.channelName}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-red-400">{t('ranking.creator_badge')}</p>
            </div>
          </Card>
          <EditProfileForm profile={profile} onSaved={(p) => setProfile(p)} />
          <SubmitForm onSubmitted={() => setSubmissionsRefresh((n) => n + 1)} />
          <MySubmissions refreshToken={submissionsRefresh} />
        </div>
      ) : null}

      {isPending ? (
        <Card className="flex items-center gap-4 p-5 border-amber-500/30 bg-amber-950/20 shadow-[2px_2px_0px_#000000]">
          <IconBadge icon={Clock} variant="amber" size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white uppercase tracking-tight">{t('ranking.social.pending_title')}</p>
            <p className="text-xs text-amber-400/90 font-medium mt-0.5">{t('ranking.social.pending_sub')}</p>
          </div>
        </Card>
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
