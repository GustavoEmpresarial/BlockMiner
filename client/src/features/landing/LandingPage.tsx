import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../shared/auth/auth.store';
import SiteFooter from '../../shared/components/SiteFooter';
import { formatHashrate } from '../../shared/utils/machine';
import { persistUtmParams, trackLandingEvent, initMetaPixel } from '../../shared/utils/landingAnalytics';
import { hasNonEssentialCookieConsent, onCookieConsentChange } from '../../shared/utils/cookieConsent';
import { useLandingScrollDepth } from '../../shared/hooks/useLandingScrollDepth';
import { usePublicStatsPoll } from '../../shared/hooks/usePublicStatsPoll';
import { useLandingSeo, type LandingFaqItemDef } from '../../shared/hooks/useLandingSeo';

import {
  estimateNetworkHashRate,
  uptimeDays,
  useCountUp,
  useInViewOnce,
} from './lib/landing.shared';
import type { PublicFeed } from './lib/landing.shared';
import {
  LandingAdsBanner,
  LandingBackground,
  LandingCommunityStats,
  LandingCrypto,
  LandingFaq,
  LandingFeatures,
  LandingFeed,
  LandingFinalCta,
  LandingGames,
  LandingHeader,
  LandingHero,
  LandingHowItWorks,
  LandingLiveStats,
  LandingTestimonials,
} from './components/landing.parts';

export default function Landing() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const publicStats = usePublicStatsPoll();
  const [publicFeed, setPublicFeed] = useState<PublicFeed>({ withdrawals: [], deposits: [] });
  const fetchPublicFeed = useCallback(async () => {
    try {
      const r = await fetch('/api/public-feed');
      if (r.ok) {
        const d = (await r.json()) as PublicFeed & { ok?: boolean };
        setPublicFeed({ withdrawals: d.withdrawals ?? [], deposits: d.deposits ?? [] });
      }
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    void fetchPublicFeed();
    const id = setInterval(fetchPublicFeed, 30_000);
    return () => clearInterval(id);
  }, [fetchPublicFeed]);

  useLandingScrollDepth();

  useEffect(() => {
    persistUtmParams(location.search);
    const utm = (() => {
      try {
        const raw = sessionStorage.getItem('blockminer_utm');
        return raw ? JSON.parse(raw) as Record<string, string> : {};
      } catch { return {}; }
    })();
    const referrerDomain = (() => {
      try { return document.referrer ? new URL(document.referrer).hostname : null; } catch { return null; }
    })();
    fetch('/api/track/hit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: '/',
        referrerDomain: referrerDomain || 'direct',
        utmSource: utm.utm_source ?? null,
        utmMedium: utm.utm_medium ?? null,
        utmCampaign: utm.utm_campaign ?? null,
      }),
      keepalive: true,
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Meta Pixel is a non-essential/advertising cookie under our Cookie Policy — only ever
  // loaded once the visitor has explicitly accepted (never on first paint by default). If
  // they accept the banner while already on this page, initMetaPixel() fires immediately via
  // the consent-change listener below, no reload needed.
  useEffect(() => {
    const w = window;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    const run = () => initMetaPixel();
    const schedule = () => {
      if (typeof w.requestIdleCallback === 'function') {
        idleId = w.requestIdleCallback(run, { timeout: 2500 });
      } else {
        timeoutId = w.setTimeout(run, 1);
      }
    };
    if (hasNonEssentialCookieConsent()) schedule();
    const unsubscribe = onCookieConsentChange((choice) => {
      if (choice === 'accepted') schedule();
    });
    return () => {
      unsubscribe();
      if (idleId !== null && typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idleId);
      if (timeoutId !== null) w.clearTimeout(timeoutId);
    };
  }, []);

  const networkHs = useMemo(() => estimateNetworkHashRate(publicStats), [publicStats]);
  const faqItems = useMemo<LandingFaqItemDef[]>(
    () => [
      { id: 'faq1', qKey: 'landing.faq.q1', aKey: 'landing.faq.a1' },
      { id: 'faq2', qKey: 'landing.faq.q2', aKey: 'landing.faq.a2' },
      { id: 'faq3', qKey: 'landing.faq.q3', aKey: 'landing.faq.a3' },
      { id: 'faq4', qKey: 'landing.faq.q4', aKey: 'landing.faq.a4' },
      { id: 'faq5', qKey: 'landing.faq.q5', aKey: 'landing.faq.a5' },
    ],
    [],
  );

  useLandingSeo(t, i18n.language, faqItems);

  const [statsRef, statsVisible] = useInViewOnce();
  const days = uptimeDays();
  const usersEnd = typeof publicStats?.users === 'number' ? publicStats.users : 0;
  const minersEnd = typeof publicStats?.activeMiners === 'number' ? publicStats.activeMiners : 0;
  const withdrawnEnd = typeof publicStats?.totalWithdrawn === 'number' ? publicStats.totalWithdrawn : 0;
  const usersShown = useCountUp(usersEnd, statsVisible && usersEnd > 0, 0);
  const minersShown = useCountUp(minersEnd, statsVisible && minersEnd > 0, 0);
  const withdrawnShown = useCountUp(withdrawnEnd, statsVisible && withdrawnEnd > 0, 2);


  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const onCtaClick = (ctaId: string, destination: string) => {
    trackLandingEvent('landing_cta_click', { cta_id: ctaId, destination });
  };

  const liveStats = [
    { label: 'JOGADORES', value: publicStats ? (publicStats.users?.toLocaleString() ?? '—') : '—', color: 'text-sky-400' },
    { label: 'POL SACADO', value: publicStats ? `${Number(publicStats.totalWithdrawn ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} POL` : '—', color: 'text-emerald-400' },
    { label: 'RIGS ONLINE', value: publicStats ? (publicStats.activeMiners?.toLocaleString() ?? '—') : '—', color: 'text-violet-400' },
    { label: 'HASHRATE', value: formatHashrate(networkHs), color: 'text-cyan-400' },
    { label: 'SESSÕES', value: '1M+', color: 'text-amber-400' },
    { label: 'NO AR', value: `${days} dias`, color: 'text-pink-400' },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#020511] text-slate-100">
      <a
        href="#main-content"
        className="absolute left-4 top-0 z-[100] -translate-y-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-4 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
      >
        {t('landing.skip')}
      </a>

      <LandingBackground />
      <LandingHeader t={t} onCtaClick={onCtaClick} />
      <LandingAdsBanner layered />

      <main id="main-content" className="relative z-10">
        <LandingHero t={t} publicStats={publicStats} onCtaClick={onCtaClick} />
        <LandingLiveStats stats={liveStats} />
        <LandingHowItWorks t={t} />
        <LandingAdsBanner />
        <LandingFeatures t={t} />
        <LandingCommunityStats
          t={t}
          statsRef={statsRef}
          publicStats={publicStats}
          usersShown={usersShown}
          minersShown={minersShown}
          withdrawnShown={withdrawnShown}
          days={days}
          networkHs={networkHs}
        />
        <LandingTestimonials t={t} />
        <LandingGames t={t} />
        <LandingCrypto t={t} />
        <LandingFeed publicFeed={publicFeed} />
        <LandingFaq t={t} faqItems={faqItems} />
        <LandingFinalCta t={t} onCtaClick={onCtaClick} />
      </main>

      <LandingAdsBanner layered />
      <SiteFooter />
    </div>
  );
}
