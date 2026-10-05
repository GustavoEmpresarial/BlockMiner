import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';

export function CheckinGraceBanner({ graceEndsAt }: { graceEndsAt: string }) {
  const { t } = useTranslation();
  const time = (() => {
    try {
      return new Date(graceEndsAt).toLocaleString();
    } catch {
      return graceEndsAt;
    }
  })();

  return (
    <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-950/20 px-5 py-4 flex items-start gap-3 shadow-[2px_2px_0px_#000000]">
      <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-xs sm:text-sm text-amber-300 font-medium leading-relaxed">
        {t('checkin.grace_until', {
          defaultValue: 'Grace period until {{time}} — check in today to keep your streak.',
          time,
        })}
      </p>
    </div>
  );
}
