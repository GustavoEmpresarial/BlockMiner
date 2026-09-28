import type { TFunction } from 'i18next';
import { featureT } from '../../../shared/utils/featureT';

export type IoTranslate = TFunction;

/** Internal offerwall — active i18next locale. */
export const t = featureT as unknown as TFunction;
