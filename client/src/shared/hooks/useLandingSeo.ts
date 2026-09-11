import { useEffect, useMemo } from 'react';
import type { TFunction } from 'i18next';

export type LandingFaqItemDef = {
  id: string;
  qKey: string;
  aKey: string;
};

const FAQ_JSON_LD_ID = 'blockminer-landing-faq-jsonld';

function setMetaByName(name: string, content: string) {
  let element = document.querySelector(`meta[name="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('name', name);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setMetaByProperty(property: string, content: string) {
  let element = document.querySelector(`meta[property="${property}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute('property', property);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

/** Landing page title, Open Graph/Twitter tags, and FAQ structured data. */
export function useLandingSeo(t: TFunction, language: string, faqItems: LandingFaqItemDef[]) {
  const title = t('landing.meta.title');
  const description = t('landing.meta.description');

  const faqJsonLd = useMemo(() => {
    const mainEntity = faqItems.map((item) => ({
      '@type': 'Question',
      name: t(item.qKey),
      acceptedAnswer: {
        '@type': 'Answer',
        text: t(item.aKey),
      },
    }));
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity,
    });
  }, [faqItems, t]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    document.documentElement.lang = language.split('-')[0] || language;
    document.title = title;

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://blockminer.space';
    const canonicalUrl = `${origin}/`;

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

    setMetaByName('description', description);
    setMetaByName('twitter:card', 'summary');
    setMetaByName('twitter:title', title);
    setMetaByName('twitter:description', description);
    setMetaByProperty('og:title', title);
    setMetaByProperty('og:description', description);
    setMetaByProperty('og:type', 'website');
    setMetaByProperty('og:url', canonicalUrl);

    let script = document.getElementById(FAQ_JSON_LD_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = FAQ_JSON_LD_ID;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = faqJsonLd;

    return () => {
      script?.remove();
    };
  }, [description, faqJsonLd, language, title]);
}
