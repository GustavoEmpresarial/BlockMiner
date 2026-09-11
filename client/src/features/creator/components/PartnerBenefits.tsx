import { Gift, Send, Users, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PartnerBenefits() {
  const { t } = useTranslation();

  const cards = [
    {
      icon: Gift,
      iconClass: 'text-violet-400',
      title: t('ranking.social.benefit_machine_title'),
      body: t('ranking.social.benefit_machine_body'),
    },
    {
      icon: Users,
      iconClass: 'text-red-400',
      title: t('ranking.social.benefit_visibility_title'),
      body: t('ranking.social.benefit_visibility_body'),
    },
    {
      icon: Send,
      iconClass: 'text-emerald-400',
      title: t('ranking.social.benefit_unlimited_title'),
      body: t('ranking.social.benefit_unlimited_body'),
    },
  ] as const;

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-violet-950/10 p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Star className="w-4 h-4 text-violet-400" />
        <p className="text-sm font-black text-white">{t('ranking.social.benefits_title')}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map(({ icon: Icon, iconClass, title, body }, index) => (
          <div
            key={index}
            className="flex items-start gap-3 rounded-xl bg-white/3 border border-white/8 px-4 py-3"
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconClass}`} />
            <div>
              <p className="text-xs font-black text-white">{title}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
