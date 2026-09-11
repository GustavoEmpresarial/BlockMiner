import { LegalDocumentPage } from './components/LegalDocumentPage';
import { TERMS_OF_USE_SECTION_IDS } from './lib/legalSectionIds';

export function TermsOfUsePage() {
  return (
    <LegalDocumentPage
      canonicalPath="/terms-of-use"
      metaTitleKey="legal.termsOfUse.meta.title"
      metaDescriptionKey="legal.termsOfUse.meta.description"
      eyebrowKey="legal.termsOfUse.eyebrow"
      titleKey="legal.termsOfUse.title"
      introKey="legal.termsOfUse.intro"
      sectionIds={TERMS_OF_USE_SECTION_IDS}
      sectionsTranslationPrefix="legal.termsOfUse.sections"
    />
  );
}
