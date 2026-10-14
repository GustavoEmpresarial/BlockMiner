import { useTranslation } from 'react-i18next';
import { machineRarityStyle } from '../lib/machineRarity';

export function MachineRarityBadge({
  level,
  size = 'sm',
  className = '',
}: {
  level: unknown;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const { t } = useTranslation();
  const style = machineRarityStyle(level);
  const sizing = size === 'xs' ? 'px-1.5 py-px text-[8px]' : 'px-2 py-0.5 text-[9px]';
  return (
    <span
      data-rarity={style.rarity}
      className={`inline-flex shrink-0 items-center rounded-full border font-black uppercase tracking-wider ${sizing} ${style.badge} ${className}`}
    >
      {t(style.labelKey)}
    </span>
  );
}
