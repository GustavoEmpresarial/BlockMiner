import type { TFunction } from 'i18next';
import { featureT } from '../../../shared/utils/featureT';

/** Matches `useTranslation().t` passed into wallet presentational components. */
export type WalletTFunction = TFunction;

/** Non-hook `t()` for wallet hooks (e.g. `useWallet`). */
export const t = featureT as unknown as TFunction;
