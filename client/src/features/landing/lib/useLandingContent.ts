import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getFaqItems,
  getFeatureCards,
  getHowSteps,
  getLandingCopy,
  getLandingGames,
  getTestimonials,
} from './landing.data';

/** Landing strings + lists bound to the active i18n language. */
export function useLandingContent() {
  const { i18n } = useTranslation();
  return useMemo(
    () => ({
      copy: getLandingCopy(),
      featureCards: getFeatureCards(),
      howSteps: getHowSteps(),
      testimonials: getTestimonials(),
      games: getLandingGames(),
      faqItems: getFaqItems(),
    }),
    [i18n.language],
  );
}
