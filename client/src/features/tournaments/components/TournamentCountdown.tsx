import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';

export function TournamentCountdown({
  startsAt,
  endsAt,
  status,
}: {
  startsAt: string;
  endsAt: string;
  status: string;
}) {
  const { t } = useTranslation();
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (status !== 'ACTIVE') return undefined;
    const tick = () => setRemainingMs(Math.max(0, new Date(endsAt).getTime() - Date.now()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt, status]);

  if (status === 'SCHEDULED') {
    const untilStart = new Date(startsAt).getTime() - Date.now();
    if (untilStart <= 0) return null;
    const h = Math.floor(untilStart / 3_600_000);
    const m = Math.floor((untilStart % 3_600_000) / 60_000);
    return (
      <span className="flex items-center gap-1 text-xs text-slate-400 font-mono">
        <Clock className="h-3 w-3" />
        {t('tournaments.startsIn', { h, m })}
      </span>
    );
  }

  if (status !== 'ACTIVE' || remainingMs === 0) return null;

  const h = Math.floor(remainingMs / 3_600_000);
  const m = Math.floor((remainingMs % 3_600_000) / 60_000);
  const s = Math.floor((remainingMs % 60_000) / 1000);

  return (
    <span className="flex items-center gap-1 text-xs text-emerald-400 font-mono">
      <Clock className="h-3 w-3 animate-pulse" />
      {h > 0 ? t('tournaments.remaining', { h, m }) : t('tournaments.remainingShort', { m, s })}
    </span>
  );
}
