import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ChevronDown } from 'lucide-react';
import SiteFooter from '../../../shared/components/SiteFooter';

type SectionBodyProps = {
  paragraphs: string[];
  bullets?: string[];
};

function SectionBody({ paragraphs, bullets }: SectionBodyProps) {
  return (
    <div className="space-y-4 text-[15px] leading-[1.75] text-white md:text-base md:leading-8">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="text-pretty">
          {paragraph}
        </p>
      ))}
      {bullets && bullets.length > 0 ? (
        <ul className="list-disc space-y-2 pl-5 marker:text-sky-400/90">
          {bullets.map((item, index) => (
            <li key={index} className="text-pretty pl-1">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const OTHER_LEGAL_PAGES: { path: '/terms-of-use' | '/privacy-policy' | '/cookie-policy'; labelKey: string }[] = [
  { path: '/terms-of-use', labelKey: 'legal.common.readTermsOfUse' },
  { path: '/privacy-policy', labelKey: 'legal.common.readPrivacyPolicy' },
  { path: '/cookie-policy', labelKey: 'legal.common.readCookiePolicy' },
];

export type LegalDocumentPageProps = {
  canonicalPath: '/terms-of-use' | '/privacy-policy' | '/cookie-policy';
  metaTitleKey: string;
  metaDescriptionKey: string;
  eyebrowKey: string;
  titleKey: string;
  introKey: string;
  sectionIds: readonly string[];
  sectionsTranslationPrefix: string;
};

/** Public long-form legal page (plain text from i18n — no HTML injection). */
export function LegalDocumentPage({
  canonicalPath,
  metaTitleKey,
  metaDescriptionKey,
  eyebrowKey,
  titleKey,
  introKey,
  sectionIds,
  sectionsTranslationPrefix,
}: LegalDocumentPageProps) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState(0);
  const [activeSection, setActiveSection] = useState<string>(sectionIds[0] ?? '');

  useEffect(() => {
    document.title = t(metaTitleKey);
    const desc = t(metaDescriptionKey);
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', desc);
  }, [t, metaTitleKey, metaDescriptionKey]);

  const onScroll = useCallback(() => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(100, Math.round(((window.scrollY || doc.scrollTop) / max) * 100)) : 0;
    setProgress(p);

    // Track which section is currently in view so the sidebar nav can highlight it — without
    // this, "Nesta página" was just a flat list of links with no sense of where you are in a
    // 10-section document, which was a big part of why the page felt hard to navigate.
    let current = sectionIds[0] ?? '';
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= 140) current = id;
    }
    setActiveSection(current);
  }, [sectionIds]);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    const tid = window.setTimeout(() => onScroll(), 0);
    return () => {
      window.clearTimeout(tid);
      window.removeEventListener('scroll', onScroll);
    };
  }, [onScroll]);

  const resolveSectionContent = (sectionKey: string): SectionBodyProps => {
    const base = `${sectionsTranslationPrefix}.${sectionKey}`;
    const tf = t as TFunction;
    const paragraphsRaw = tf(`${base}.paragraphs`, { returnObjects: true });
    const bulletsRaw = tf(`${base}.bullets`, { returnObjects: true });
    const paragraphs = Array.isArray(paragraphsRaw)
      ? paragraphsRaw.filter((x): x is string => typeof x === 'string')
      : [];
    const bullets = Array.isArray(bulletsRaw)
      ? bulletsRaw.filter((x): x is string => typeof x === 'string')
      : [];
    return { paragraphs, bullets };
  };

  const tocList = (onNavigate?: () => void) => (
    <ul className="space-y-1">
      {sectionIds.map((sectionKey) => {
        const isActive = sectionKey === activeSection;
        return (
          <li key={sectionKey}>
            <a
              onClick={onNavigate}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-sky-500/15 font-semibold text-sky-300' : 'text-white hover:bg-white/5'
              }`}
              href={`#${sectionKey}`}
            >
              {t(`${sectionsTranslationPrefix}.${sectionKey}.title`)}
            </a>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-screen bg-[#02070f] text-white print:bg-white print:text-black">
      <div className="print:hidden pointer-events-none fixed left-0 right-0 top-0 z-50 h-0.5 bg-white/10" aria-hidden>
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main id="legal-main" className="px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <article className="mx-auto max-w-6xl">
          <header className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-8 md:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-400">{t(eyebrowKey)}</p>
            <h1 className="mt-4 text-balance text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
              {t(titleKey)}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-white/90 md:text-lg md:leading-8">{t(introKey)}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">
                {t('legal.common.lastUpdated', { date: t('legal.common.lastUpdatedDate') })}
              </p>
              <Link className="text-xs font-semibold uppercase tracking-wide text-sky-400 hover:text-sky-300" to="/">
                {t('legal.common.backToHome')}
              </Link>
            </div>
          </header>

          {/* Mobile/tablet: a collapsed <details> instead of dumping all N section links above
              the content — that flat dump before any actual text was the biggest complaint
              about this page being hard to use on a phone. Desktop keeps the sticky sidebar. */}
          <details className="mb-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4 print:hidden lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold uppercase tracking-[0.18em] text-white">
              {t('legal.common.onThisPage')}
              <ChevronDown className="h-4 w-4 text-white/70" aria-hidden />
            </summary>
            <nav aria-label={t('legal.common.sectionNavigationAriaLabel')} className="mt-3">
              {tocList()}
            </nav>
          </details>

          <div className="lg:grid lg:grid-cols-[minmax(200px,260px)_minmax(0,1fr)] lg:gap-12">
            <nav aria-label={t('legal.common.sectionNavigationAriaLabel')} className="print:hidden hidden lg:block">
              <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-white/10 lg:bg-white/[0.04] lg:p-5">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">{t('legal.common.onThisPage')}</p>
                <div className="mt-4">{tocList()}</div>
              </div>
            </nav>

            <div className="min-w-0 space-y-10 md:space-y-12">
              {sectionIds.map((sectionKey) => {
                const { paragraphs, bullets } = resolveSectionContent(sectionKey);
                return (
                  <section
                    key={sectionKey}
                    id={sectionKey}
                    className="scroll-mt-24 rounded-3xl border border-white/10 bg-white/[0.04] p-7 md:p-9"
                    aria-labelledby={`${sectionKey}-title`}
                  >
                    <h2 id={`${sectionKey}-title`} className="text-xl font-bold tracking-tight text-white md:text-2xl">
                      {t(`${sectionsTranslationPrefix}.${sectionKey}.title`)}
                    </h2>
                    <div className="mt-6">
                      <SectionBody paragraphs={paragraphs} bullets={bullets} />
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="mt-14 flex flex-wrap gap-3 print:hidden">
            <Link
              className="rounded-full border border-sky-400/40 bg-sky-500/10 px-6 py-3 text-sm font-bold text-sky-200 hover:bg-sky-500/20"
              to="/register"
            >
              {t('legal.common.backToRegistration')}
            </Link>
            {OTHER_LEGAL_PAGES.filter((p) => p.path !== canonicalPath).map((p) => (
              <Link
                key={p.path}
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-bold text-white hover:bg-white/5"
                to={p.path}
              >
                {t(p.labelKey)}
              </Link>
            ))}
            <Link
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-bold text-white hover:bg-white/5"
              to="/"
            >
              {t('legal.common.backToHome')}
            </Link>
          </div>
        </article>
      </main>
      <div className="print:hidden">
        <SiteFooter />
      </div>
    </div>
  );
}
