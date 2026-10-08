import { useTranslation } from 'react-i18next';
import { isShowcase3dCatalogMachine } from '../lib/rackMinerModel';

type NoticeMachine = {
  name?: string | null;
  minerName?: string | null;
  imageUrl?: string | null;
  modelUrl?: string | null;
};

export function ShowcaseRoomOnlyNotice(_props: { machine?: unknown }) {
  return null;
}
