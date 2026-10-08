import { useTranslation } from 'react-i18next';
import { isShowcase3dCatalogMachine } from '../lib/rackMinerModel';

type NoticeMachine = {
  name?: string | null;
  minerName?: string | null;
  imageUrl?: string | null;
  modelUrl?: string | null;
};

export function ShowcaseRoomOnlyNotice({ machine }: { machine: NoticeMachine | null | undefined }) {
  const { t } = useTranslation();
  if (!isShowcase3dCatalogMachine(machine)) return null;
  return (
    <p role="note" className="text-xs font-bold text-amber-300">
      {t('inventory.showcase_3d_fits_only')}
    </p>
  );
}
