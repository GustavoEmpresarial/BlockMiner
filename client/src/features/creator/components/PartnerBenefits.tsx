import { Gift, Send, Users, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Card from '../../../shared/components/Card';
import SectionHeader from '../../../shared/components/SectionHeader';

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
    <Card className="p-6 sm:p-7 space-y-4">
      <SectionHeader icon={Star} iconVariant="violet" title={t('ranking.social.benefits_title')} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {cards.map(({ icon: Icon, iconClass, title, body }, index) => (
          <div
            key={index}
            className="flex items-start gap-3.5 rounded-2xl bg-slate-950/60 border-2 border-slate-800 p-4 shadow-[2px_2px_0px_#000000]"
          >
            <div className={`p-2.5 rounded-xl bg-slate-900 border border-slate-800 shadow-[1px_1px_0px_#000000] shrink-0 ${iconClass}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black text-white uppercase tracking-tight">{title}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-1 leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
