import { LegalDocumentPage } from './components/LegalDocumentPage';
import { COOKIE_POLICY_SECTION_IDS } from './lib/legalSectionIds';

export function CookiePolicyPage() {
  return (
    <LegalDocumentPage
      canonicalPath="/cookie-policy"
      metaTitleKey="legal.cookiePolicy.meta.title"
      metaDescriptionKey="legal.cookiePolicy.meta.description"
      eyebrowKey="legal.cookiePolicy.eyebrow"
      titleKey="legal.cookiePolicy.title"
      introKey="legal.cookiePolicy.intro"
      sectionIds={COOKIE_POLICY_SECTION_IDS}
      sectionsTranslationPrefix="legal.cookiePolicy.sections"
    />
  );
}
