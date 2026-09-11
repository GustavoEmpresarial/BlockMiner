import { useState, useEffect } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  Clock,
  Gamepad2,
  Pickaxe,
  Play,
  Star,
  Users,
  Wallet,
  Youtube,
  Zap,
} from 'lucide-react';
import BrandLogo from '../../../shared/components/BrandLogo';
import { useLandingContent } from '../lib/useLandingContent';
import { formatHashrate, timeAgo } from '../lib/landing.hooks';
import type { PublicStatsPayload, PublicFeed, FeedRow } from '../lib/landing.hooks';

// Ported 1:1 (structure + Tailwind classes) from
// legacy/client/src/pages/landing/landing.parts.tsx. Differences vs legacy,
// all driven by infra genuinely absent in current/client (see LandingPage.tsx
// for the full rationale):
//  - i18n via useLandingContent() (landing.* locale keys)
//  - no GA/Meta Pixel: onCtaClick tracking calls dropped entirely
//  - no useLandingSeo: <head> tag management dropped
//  - LandingAdsBanner: kept (same iframe ad slot as legacy)

export type LandingCtaHandler = (ctaId: string, destination: string) => void;

const gradientBtn =
  'motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:scale-[1.03] inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-500/40 motion-safe:hover:shadow-[0_0_40px_rgba(59,130,246,0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 motion-reduce:hover:scale-100';

const outlineBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 py-3.5 text-sm font-semibold text-slate-100 motion-safe:transition-all motion-safe:duration-200 motion-safe:hover:scale-[1.03] motion-safe:hover:border-white/35 motion-safe:hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 motion-reduce:hover:scale-100';

export function LandingBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-[#020511] to-[#060a14]" />
      <div className="absolute -top-64 -left-64 h-[500px] w-[500px] rounded-full bg-blue-600/8 blur-3xl animate-blob" />
      <div className="absolute top-1/3 -right-48 h-96 w-96 rounded-full bg-violet-600/8 blur-3xl animate-blob-slow" />
      <div className="absolute -bottom-48 left-1/4 h-80 w-80 rounded-full bg-cyan-500/6 blur-3xl animate-blob-delay" />
      <div className="absolute inset-x-0 top-0 h-[55vh] bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.10),transparent_60%)]" />
      <div
        className="absolute inset-0 animate-gridPulse"
        style={{
          backgroundImage: `linear-gradient(rgba(56,189,248,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.07) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#020511] to-transparent" />
    </div>
  );
}

export function LandingAdsBanner({ layered = false }: { layered?: boolean }) {
  return (
    <div className={`${layered ? 'relative z-10 ' : ''}py-4 overflow-x-auto`}>
      <div className="w-full max-w-[468px] mx-auto">
        <iframe
          data-aa="2436936"
          src="//ad.a-ads.com/2436936/?size=468x60"
          className="border-0 w-full h-[60px] block mx-auto"
          style={{ overflow: 'hidden' }}
        />
      </div>
    </div>
  );
}

export function LandingHeader({ onCtaClick }: { onCtaClick: LandingCtaHandler }) {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <header className="relative z-20 border-b border-white/[0.07] bg-[#02070f]/90 backdrop-blur-xl sticky top-0">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label={copy.nav.brandAria}>
          <BrandLogo variant="header" interactive />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm" aria-label={copy.nav.mainAria}>
          <a href="#how-it-works" className="text-slate-400 hover:text-white transition-colors duration-150">
            {copy.footer.linkHow}
          </a>
          <a href="#features" className="text-slate-400 hover:text-white transition-colors duration-150">
            {copy.nav.features}
          </a>
          <a href="#faq" className="text-slate-400 hover:text-white transition-colors duration-150">
            {copy.nav.faq}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex text-sm text-slate-300 hover:text-white transition-colors duration-150 px-4 py-2 rounded-full hover:bg-white/5"
          >
            {copy.nav.login}
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-bold text-white transition-all duration-150 shadow-lg shadow-sky-500/30 hover:shadow-sky-400/40 hover:scale-[1.02]"
            onClick={() => onCtaClick('header_register', '/register')}
          >
            {copy.nav.register}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function LiveMiningWidget() {
  const { t } = useTranslation();
  const [blockProgress, setBlockProgress] = useState(42);
  const [blocksFound, setBlocksFound] = useState(127);
  const [earnings, setEarnings] = useState(3.82);
  const [hashrate, setHashrate] = useState(4200);

  useEffect(() => {
    const id = setInterval(() => {
      setBlockProgress((p) => {
        const next = p + Math.random() * 2.5 + 0.8;
        if (next >= 100) {
          setBlocksFound((b) => b + 1);
          setEarnings((e) => Number((e + 0.003).toFixed(3)));
          return next - 100;
        }
        return next;
      });
      setHashrate(3900 + Math.floor(Math.random() * 500));
    }, 220);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative w-full max-w-xs">
      <div className="absolute -inset-6 rounded-full bg-blue-500/15 blur-3xl" aria-hidden />
      <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-sky-500/20 to-violet-600/10 blur-xl" aria-hidden />
      <div className="relative rounded-2xl border border-white/12 bg-slate-900/95 backdrop-blur-sm shadow-2xl overflow-hidden">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-sky-400/60 to-transparent" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/20">
                <Pickaxe className="h-3.5 w-3.5 text-sky-400" aria-hidden />
              </div>
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest font-mono">Rig #1</span>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[10px] font-bold text-emerald-400 font-mono uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
              ONLINE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mb-4">
            {[
              { label: 'Hashrate', value: `${hashrate.toLocaleString()} H/s`, color: 'text-sky-400' },
              { label: t('landing.widget.blocks'), value: String(blocksFound), color: 'text-violet-400' },
              { label: t('landing.widget.earnings'), value: `${earnings.toFixed(3)} POL`, color: 'text-emerald-400' },
              { label: t('landing.widget.efficiency'), value: '98.2%', color: 'text-amber-400' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-slate-800/70 px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-wider text-slate-600 font-mono">{stat.label}</p>
                <p className={`mt-0.5 text-sm font-black font-mono ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-[9px] font-mono text-slate-600 mb-1.5 uppercase tracking-wider">
              <span>{t('landing.current_block')}</span>
              <span>{Math.floor(blockProgress)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-200"
                style={{ width: `${blockProgress}%` }}
              />
            </div>
          </div>

          <p className="mt-3.5 text-[9px] text-slate-700 text-center font-mono">
            {t('landing.sim_caption')}
          </p>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
      </div>
    </div>
  );
}

export function LandingHero({
  publicStats,
  onCtaClick,
}: {
  publicStats: PublicStatsPayload | null;
  onCtaClick: LandingCtaHandler;
}) {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <section className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-16 pb-20 sm:pt-24 sm:pb-32">
      <div className="grid lg:grid-cols-[1fr_auto] gap-14 lg:gap-20 items-center">
        <div className="flex flex-col items-start max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs uppercase tracking-[0.22em] text-emerald-400">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 motion-safe:animate-pulse motion-reduce:animate-none" aria-hidden />
            {copy.hero.badge}
          </div>

          <h1 className="mt-8 font-black leading-[1.06] text-[clamp(2rem,4.5vw+0.6rem,3.75rem)]">
            <span className="block text-white">{copy.hero.headlineLine1}</span>
            <span className="block bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
              {copy.hero.headlineHighlight}
            </span>
            <span className="block text-white">{copy.hero.headlineLine2}</span>
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">
            {copy.hero.subheadlineBefore}
            <strong className="font-semibold text-white">{copy.hero.subheadlineEmphasis}</strong>
            {copy.hero.subheadlineAfter}
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 w-full sm:flex-row sm:items-center sm:w-auto">
            <Link
              to="/register"
              className={gradientBtn}
              aria-label={copy.hero.ctaPrimary}
              onClick={() => onCtaClick('hero_primary', '/register')}
            >
              {copy.hero.ctaPrimary}
              <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
            </Link>
            <Link
              to="/login"
              className={outlineBtn}
              aria-label={copy.hero.ctaSecondary}
              onClick={() => onCtaClick('hero_secondary', '/login')}
            >
              {copy.hero.ctaSecondary}
            </Link>
          </div>

          <div className="mt-9 flex flex-wrap gap-2.5">
            <div className="flex items-center gap-2 rounded-2xl border border-sky-500/25 bg-sky-500/10 px-3.5 py-2 text-xs text-sky-400">
              <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <div>
                <p className="text-[9px] uppercase tracking-wider opacity-60">{copy.hero.trustMiners}</p>
                <p className="font-bold">
                  {typeof publicStats?.activeMiners === 'number' ? publicStats.activeMiners.toLocaleString() : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-400">
              <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <div>
                <p className="text-[9px] uppercase tracking-wider opacity-60">{copy.hero.trustPaid}</p>
                <p className="font-bold">
                  {typeof publicStats?.totalWithdrawn === 'number'
                    ? `${Number(publicStats.totalWithdrawn).toLocaleString(undefined, { maximumFractionDigits: 0 })} POL`
                    : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-400">
              <span className="flex items-center gap-0.5" aria-label={copy.hero.trustStarsAria}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3 w-3 fill-current" aria-hidden />
                ))}
              </span>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex justify-end">
          <LiveMiningWidget />
        </div>
      </div>
    </section>
  );
}

export function LandingLiveStats({ stats }: { stats: { label: string; value: string; color: string }[] }) {
  return (
    <div className="relative border-y border-white/[0.07] bg-slate-950/50 py-3 overflow-x-auto scrollbar-hide">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="shrink-0 flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-1 text-[10px] font-bold font-mono uppercase tracking-wider text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden />
            LIVE
          </span>
          <div className="flex items-center gap-5 ml-1 overflow-x-auto scrollbar-hide">
            {stats.map((s) => (
              <div key={s.label} className="shrink-0 flex items-center gap-1.5 text-xs font-mono">
                <span className="text-slate-700">▸</span>
                <span className="text-slate-600 uppercase tracking-wider text-[10px]">{s.label}:</span>
                <span className={`font-bold ${s.color}`}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingHowItWorks() {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
      <div className="text-center mb-16">
        <p className="text-xs uppercase tracking-[0.32em] text-sky-400 font-mono">{copy.how.kicker}</p>
        <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">{copy.how.title}</h2>
        <p className="mt-3 max-w-2xl mx-auto text-slate-400">{copy.how.subtitle}</p>
      </div>
      <div className="relative grid gap-6 md:grid-cols-3">
        <div
          className="hidden md:block absolute top-[2.75rem] left-[calc(33.3%_-_1rem)] right-[calc(33.3%_-_1rem)] h-px border-t border-dashed border-sky-500/25"
          aria-hidden
        />
        {howSteps.map(({ icon: StepIcon, title, body }, idx) => (
          <div key={title} className="relative flex flex-col items-center text-center px-4">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-sky-500/15 blur-xl scale-150" aria-hidden />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-sky-500/30 bg-slate-900/80">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/25 to-violet-600/15">
                  <StepIcon className="h-5.5 w-5.5 text-sky-400" aria-hidden />
                </div>
                <span className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-[11px] font-black text-white shadow-lg shadow-sky-500/40">
                  {idx + 1}
                </span>
              </div>
            </div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LandingFeatures() {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <section id="features" className="border-y border-white/[0.07] bg-[#040c18]/70 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.32em] text-violet-400 font-mono">{copy.features.kicker}</p>
          <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">{copy.features.title}</h2>
          <p className="mt-3 max-w-2xl mx-auto text-slate-400">{copy.features.subtitle}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featureCards.map((card) => (
            <div
              key={card.title}
              className="group relative rounded-2xl border border-white/[0.07] bg-slate-900/50 p-7 transition-all duration-300 hover:border-sky-500/25 hover:bg-slate-900/70 hover:shadow-lg hover:shadow-sky-500/8"
            >
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 bg-gradient-to-br from-sky-500/4 to-violet-500/4 transition-opacity duration-300"
                aria-hidden
              />
              <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${card.bgCls}`}>
                <card.icon className={`h-6 w-6 ${card.iconCls}`} aria-hidden />
              </div>
              <h3 className="relative mt-5 text-base font-bold text-white">{card.title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-slate-400">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingCommunityStats({
  statsRef,
  publicStats,
  usersShown,
  minersShown,
  withdrawnShown,
  days,
  networkHs,
}: {
  statsRef: RefObject<HTMLDivElement | null>;
  publicStats: PublicStatsPayload | null;
  usersShown: number;
  minersShown: number;
  withdrawnShown: number;
  days: number;
  networkHs: number;
}) {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  const rows = [
    {
      icon: Users,
      label: copy.stats.usersLabel,
      value: publicStats ? usersShown.toLocaleString() : '—',
      sub: copy.stats.usersSub,
      valueCls: 'text-sky-400',
      hoverBorder: 'hover:border-sky-500/30',
      glowCls: 'bg-sky-500/5',
    },
    {
      icon: Wallet,
      label: copy.stats.withdrawnLabel,
      value: publicStats
        ? `${withdrawnShown.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} POL`
        : '—',
      sub: copy.stats.withdrawnSub,
      valueCls: 'text-emerald-400',
      hoverBorder: 'hover:border-emerald-500/30',
      glowCls: 'bg-emerald-500/5',
    },
    {
      icon: Clock,
      label: copy.stats.uptimeLabel,
      value: `${days} dias`,
      sub: copy.stats.uptimeSub,
      valueCls: 'text-violet-400',
      hoverBorder: 'hover:border-violet-500/30',
      glowCls: 'bg-violet-500/5',
    },
    {
      icon: Zap,
      label: copy.stats.minersLabel,
      value: publicStats ? minersShown.toLocaleString() : '—',
      sub: copy.stats.minersSub,
      valueCls: 'text-amber-400',
      hoverBorder: 'hover:border-amber-500/30',
      glowCls: 'bg-amber-500/5',
    },
    {
      icon: Pickaxe,
      label: copy.stats.networkLabel,
      value: formatHashrate(networkHs),
      sub: copy.stats.networkSub,
      valueCls: 'text-cyan-400',
      hoverBorder: 'hover:border-cyan-500/30',
      glowCls: 'bg-cyan-500/5',
    },
    {
      icon: CalendarDays,
      label: copy.stats.activityLabel,
      value: copy.stats.activityValue,
      sub: copy.stats.activitySub,
      valueCls: 'text-fuchsia-400',
      hoverBorder: 'hover:border-fuchsia-500/30',
      glowCls: 'bg-fuchsia-500/5',
    },
  ];

  return (
    <section id="community" ref={statsRef} className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
      <div className="text-center mb-14">
        <h2 className="text-3xl font-black text-white sm:text-4xl">{copy.community.title}</h2>
        <p className="mt-3 text-slate-400">{copy.community.subtitle}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-900/50 p-6 transition-all duration-300 ${row.hoverBorder} hover:shadow-xl`}
          >
            <div
              className={`absolute top-0 right-0 h-28 w-28 rounded-full ${row.glowCls} blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
              aria-hidden
            />
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80">
              <row.icon className={`h-5 w-5 ${row.valueCls}`} aria-hidden />
            </div>
            <p className="mt-4 text-[10px] uppercase tracking-[0.2em] text-slate-600 font-mono">{row.label}</p>
            <p className={`mt-1.5 text-2xl font-black sm:text-3xl font-mono ${row.valueCls}`}>{row.value}</p>
            <p className="mt-2 text-xs text-slate-500">{row.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LandingTestimonials() {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <section className="border-y border-white/[0.07] bg-[#040c18]/70 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 className="text-center text-3xl font-black text-white sm:text-4xl">{copy.testimonials.title}</h2>
        <p className="mt-2 text-center text-xs text-slate-600">{copy.testimonials.disclaimer}</p>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {testimonials.map((item) => (
            <figure
              key={item.name}
              className="rounded-2xl border border-white/[0.07] bg-slate-900/50 p-7 hover:border-white/14 transition-colors duration-200"
            >
              <div className="flex items-center gap-0.5 text-amber-400" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" />
                ))}
              </div>
              <blockquote className="mt-4 text-sm leading-relaxed text-slate-300">&quot;{item.text}&quot;</blockquote>
              <figcaption className="mt-6 text-sm font-bold text-white">
                {item.name}
                <span className="block text-xs font-normal text-slate-500">{item.loc}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingGames() {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <section id="games" className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
      <div className="text-center mb-14">
        <h2 className="text-3xl font-black text-white sm:text-4xl">{copy.games.title}</h2>
        <p className="mt-3 max-w-2xl mx-auto text-slate-400">{copy.games.subtitle}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {games.map((g) => (
          <div
            key={g.title}
            className={`group rounded-2xl border border-white/[0.07] bg-slate-900/50 overflow-hidden transition-all duration-300 ${g.hoverBorder} hover:shadow-lg hover:-translate-y-0.5`}
          >
            <div className={`h-36 bg-gradient-to-br ${g.gradient} flex items-center justify-center relative overflow-hidden`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.12),transparent_65%)]" aria-hidden />
              <Gamepad2 className="h-12 w-12 text-white/85 relative z-[1] transition-transform duration-300 group-hover:scale-110" aria-hidden />
            </div>
            <div className="p-6">
              <h3 className={`text-sm font-bold uppercase tracking-wide ${g.titleCls}`}>{g.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400">{g.desc}</p>
              <p className="mt-1.5 text-[10px] text-slate-600 uppercase tracking-wider font-mono">{copy.games.loginHint}</p>
              <Link
                to="/games"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors"
              >
                <Play className="h-3.5 w-3.5" aria-hidden />
                {copy.games.cta}
              </Link>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link to="/games" className="inline-flex items-center gap-2 text-sm font-bold text-sky-400 hover:text-sky-300 transition-colors">
          {copy.games.viewAll}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export function LandingCrypto() {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <section className="border-y border-white/[0.07] bg-[#040c18]/70 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 text-center">
        <h2 className="text-2xl font-black text-white sm:text-3xl">{copy.crypto.title}</h2>
        <p className="mt-3 max-w-2xl mx-auto text-sm text-slate-400">{copy.crypto.subtitle}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {['POL', 'BTC', 'ETH', 'USDC'].map((sym) => (
            <div
              key={sym}
              className={`rounded-2xl border px-6 py-3 text-sm font-bold tracking-wide transition-all duration-200 ${
                sym === 'POL'
                  ? 'border-sky-500/40 bg-sky-500/12 text-sky-300 shadow-lg shadow-sky-500/10'
                  : 'border-white/[0.07] bg-slate-900/50 text-slate-600'
              }`}
            >
              {sym}
              {sym !== 'POL' ? <span className="ml-2 text-[10px] font-normal uppercase text-slate-600">{copy.crypto.soon}</span> : null}
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-slate-600">{copy.crypto.more}</p>
      </div>
    </section>
  );
}

export function FeedPanel({ title, rows, color }: { title: string; rows: FeedRow[]; color: 'emerald' | 'sky' }) {
  const border = color === 'emerald' ? 'border-emerald-500/20' : 'border-sky-500/20';
  const dot = color === 'emerald' ? 'bg-emerald-400' : 'bg-sky-400';
  const amtCls = color === 'emerald' ? 'text-emerald-400' : 'text-sky-400';
  const icon = color === 'emerald' ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <Wallet className="h-3 w-3" aria-hidden />;

  return (
    <div className={`rounded-2xl border ${border} bg-slate-900/60 backdrop-blur-sm overflow-hidden`}>
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.06]">
        <span className={`h-2 w-2 rounded-full ${dot} animate-pulse`} aria-hidden />
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 font-mono">{title}</span>
      </div>
      <ul className="divide-y divide-white/[0.04]">
        {rows.length === 0 ? (
          <li className="px-5 py-8 text-center text-xs text-slate-600 font-mono">sem dados</li>
        ) : (
          rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 ${amtCls}`}>{icon}</span>
                <span className="text-xs text-slate-300 font-mono truncate">{r.user}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs font-bold font-mono ${amtCls}`}>{r.amount.toFixed(4)} POL</span>
                <span className="text-[10px] text-slate-600 font-mono whitespace-nowrap">{timeAgo(r.at)}</span>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function LandingFeed({ publicFeed }: { publicFeed: PublicFeed }) {
  const { t } = useTranslation();
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
      <div className="text-center mb-10">
        <p className="text-xs uppercase tracking-[0.32em] text-sky-400 font-mono">{t('landing.widget.activity_kicker')}</p>
        <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">{t('landing.widget.activity_title')}</h2>
        <p className="mt-2 text-sm text-slate-500">{t('landing.widget.activity_subtitle')}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <FeedPanel title={t('landing.widget.recent_withdrawals')} rows={publicFeed.withdrawals} color="emerald" />
        <FeedPanel title={t('landing.widget.recent_deposits')} rows={publicFeed.deposits} color="sky" />
      </div>
    </section>
  );
}

export function FaqItem({ id, question, answer }: { id: string; question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-900/50 overflow-hidden hover:border-sky-500/25 transition-colors duration-200">
      <button
        type="button"
        id={`${id}-btn`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left font-semibold text-white hover:bg-white/4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        <span>{question}</span>
        <ChevronDown className={`w-5 h-5 text-sky-400 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} className="px-6 pb-6 text-sm leading-relaxed border-t border-white/8 text-slate-400">
          {answer}
        </div>
      ) : null}
    </div>
  );
}

export function LandingFaq() {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <section id="faq" className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
      <div className="text-center mb-12">
        <p className="text-xs uppercase tracking-[0.32em] text-sky-400 font-mono">{copy.faq.title}</p>
        <h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">{copy.faq.heading}</h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {faqItems.map((item) => (
          <FaqItem key={item.id} id={item.id} question={item.question} answer={item.answer} />
        ))}
      </div>
    </section>
  );
}

export function LandingFinalCta({ onCtaClick }: { onCtaClick: LandingCtaHandler }) {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-20 sm:pb-28">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 p-12 sm:p-16 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-600/14 via-violet-900/18 to-blue-900/20" aria-hidden />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.18),transparent_70%)]" aria-hidden />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-2/3 bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" aria-hidden />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-1/2 bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" aria-hidden />
        <div className="relative">
          <h2 className="text-3xl font-black text-white sm:text-4xl">{copy.finalCta.title}</h2>
          <p className="mt-4 max-w-xl mx-auto text-slate-300">{copy.finalCta.subtitle}</p>
          <ul className="mt-6 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 text-sm text-slate-400">
            <li className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              {copy.finalCta.bullet1}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              {copy.finalCta.bullet2}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400 font-bold">✓</span>
              {copy.finalCta.bullet3}
            </li>
          </ul>
          <Link to="/register" className={`${gradientBtn} mt-8`} onClick={() => onCtaClick('final_cta_register', '/register')}>
            {copy.finalCta.primary}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter({
  discordUrl,
  telegramUrl,
  twitterUrl,
  youtubeUrl,
}: {
  discordUrl: string;
  telegramUrl: string;
  twitterUrl: string | null;
  youtubeUrl: string | null;
}) {
  const { copy, featureCards, howSteps, testimonials, games, faqItems } = useLandingContent();
  return (
    <>
      <footer className="relative z-10 border-t border-white/[0.07] py-14 px-5 sm:px-8 bg-[#02070f] text-slate-500">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLogo variant="header" interactive />
            <p className="mt-4 text-sm text-slate-400">{copy.footer.tagline}</p>
            <p className="mt-3 text-xs text-slate-600">{copy.footer.disclaimer}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { href: discordUrl, label: copy.footer.socialDiscord, icon: null as string | null },
                { href: telegramUrl, label: copy.footer.socialTelegram, icon: null as string | null },
                ...(twitterUrl ? [{ href: twitterUrl, label: copy.footer.socialTwitter, icon: null as string | null }] : []),
                ...(youtubeUrl ? [{ href: youtubeUrl, label: copy.footer.socialYoutube, icon: 'youtube' }] : []),
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-150"
                >
                  {s.icon === 'youtube' && <Youtube className="h-3.5 w-3.5" aria-hidden />}
                  {s.label}
                </a>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{copy.footer.colProduct}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a href="#how-it-works" className="hover:text-sky-400 transition-colors">
                  {copy.footer.linkHow}
                </a>
              </li>
              <li>
                <Link to="/games" className="hover:text-sky-400 transition-colors">
                  {copy.footer.linkGames}
                </Link>
              </li>
              <li>
                <Link to="/calculator" className="hover:text-sky-400 transition-colors">
                  {copy.footer.linkCalc}
                </Link>
              </li>
              <li>
                <Link to="/transparency" className="hover:text-sky-400 transition-colors">
                  {copy.footer.linkTransparency}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{copy.footer.colCompany}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/roadmap" className="hover:text-sky-400 transition-colors">
                  {copy.footer.linkRoadmap}
                </Link>
              </li>
              <li>
                <Link to="/manual" className="hover:text-sky-400 transition-colors">
                  {copy.footer.linkManual}
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-sky-400 transition-colors">
                  {copy.nav.register}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{copy.footer.colLegal}</p>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to="/terms-of-use" className="hover:text-sky-400 transition-colors">
                  {copy.footer.legalTermsOfUse}
                </Link>
              </li>
              <li>
                <Link to="/privacy-policy" className="hover:text-sky-400 transition-colors">
                  {copy.footer.legalPrivacyPolicy}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-4 border-t border-white/[0.07] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">© {new Date().getFullYear()} Block Miner. Todos os direitos reservados.</p>
        </div>
      </footer>
      {/* legacy/client SiteFooter (compact) folded in here instead of a
          separate component — it is ~50 lines and purely presentational. */}
      <footer className="border-t border-white/10 bg-[#02070f] text-slate-300 px-4 py-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-white/10 pt-5 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <p>{copy.footer.legalDescription}</p>
          <p>{copy.footer.legalComplianceNote}</p>
        </div>
      </footer>
    </>
  );
}
