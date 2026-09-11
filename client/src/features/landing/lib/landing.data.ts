import {
  Coins,
  Gamepad2,
  Gift,
  Pickaxe,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import i18n from '../../../i18n/config';

function L(key: string, vars?: Record<string, unknown>): string {
  return i18n.t(`landing.${key}`, vars);
}

/** Landing copy from active i18next locale (pt-BR / es / en). */
export function getLandingCopy() {
  return {
    skip: L('skip'),
    nav: {
      login: L('nav.login'),
      register: L('nav.register'),
      brandAria: L('nav.brand_aria'),
      mainAria: L('nav.main_aria'),
      features: L('nav.features'),
      faq: L('nav.faq'),
    },
    hero: {
      badge: L('hero.badge'),
      headlineLine1: L('hero.headline_line1'),
      headlineHighlight: L('hero.headline_highlight'),
      headlineLine2: L('hero.headline_line2'),
      subheadlineBefore: L('hero.subheadline_before'),
      subheadlineEmphasis: L('hero.subheadline_emphasis'),
      subheadlineAfter: L('hero.subheadline_after'),
      ctaPrimary: L('hero.cta_primary'),
      ctaSecondary: L('hero.cta_secondary'),
      trustMiners: L('hero.trust_miners'),
      trustPaid: L('hero.trust_paid'),
      trustStarsAria: L('hero.trust_stars_aria'),
    },
    stats: {
      usersLabel: L('stats.users_label'),
      usersSub: L('stats.users_sub'),
      withdrawnLabel: L('stats.withdrawn_label'),
      withdrawnSub: L('stats.withdrawn_sub'),
      uptimeLabel: L('stats.uptime_label'),
      uptimeSub: L('stats.uptime_sub'),
      minersLabel: L('stats.miners_label'),
      minersSub: L('stats.miners_sub'),
      networkLabel: L('stats.network_label'),
      networkSub: L('stats.network_sub'),
      activityLabel: L('stats.activity_label'),
      activityValue: L('stats.activity_value'),
      activitySub: L('stats.activity_sub'),
    },
    how: {
      kicker: L('how.kicker'),
      title: L('how.title'),
      subtitle: L('how.subtitle'),
    },
    features: {
      kicker: L('features.kicker'),
      title: L('features.title'),
      subtitle: L('features.subtitle'),
    },
    community: {
      title: L('community.title'),
      subtitle: L('community.subtitle'),
    },
    testimonials: {
      title: L('testimonials.title'),
      disclaimer: L('testimonials.disclaimer'),
    },
    games: {
      title: L('games.title'),
      subtitle: L('games.subtitle'),
      loginHint: L('games.login_hint'),
      cta: L('games.cta'),
      viewAll: L('games.view_all'),
    },
    crypto: {
      title: L('crypto.title'),
      subtitle: L('crypto.subtitle'),
      more: L('crypto.more'),
      soon: L('crypto.soon'),
    },
    faq: {
      title: L('faq.title'),
      heading: L('faq.heading'),
    },
    finalCta: {
      title: L('final_cta.title'),
      subtitle: L('final_cta.subtitle'),
      primary: L('final_cta.primary'),
      bullet1: L('final_cta.bullet1'),
      bullet2: L('final_cta.bullet2'),
      bullet3: L('final_cta.bullet3'),
    },
    footer: {
      tagline: L('footer.tagline'),
      disclaimer: L('footer.disclaimer'),
      colProduct: L('footer.col_product'),
      linkHow: L('footer.link_how'),
      linkGames: L('footer.link_games'),
      linkCalc: L('footer.link_calc'),
      linkTransparency: L('footer.link_transparency'),
      colCompany: L('footer.col_company'),
      linkRoadmap: L('footer.link_roadmap'),
      linkManual: L('footer.link_manual'),
      colLegal: L('footer.col_legal'),
      socialDiscord: L('footer.social_discord'),
      socialTelegram: L('footer.social_telegram'),
      socialTwitter: L('footer.social_twitter'),
      socialYoutube: L('footer.social_youtube'),
      legalTermsOfUse: L('footer.link_terms'),
      legalPrivacyPolicy: L('footer.link_privacy'),
      legalDescription: L('footer.disclaimer'),
      legalComplianceNote: L('footer.copyright', { year: new Date().getFullYear() }),
    },
  };
}

export type LandingCopy = ReturnType<typeof getLandingCopy>;

/** @deprecated Prefer getLandingCopy() inside render so locale switches apply. */
export const copy = getLandingCopy();

export function getFeatureCards(): { icon: LucideIcon; title: string; body: string; iconCls: string; bgCls: string }[] {
  return [
    { icon: Zap, title: L('features.f1_title'), body: L('features.f1_body'), iconCls: 'text-sky-400', bgCls: 'from-sky-500/25 to-blue-600/10' },
    { icon: Coins, title: L('features.f2_title'), body: L('features.f2_body'), iconCls: 'text-emerald-400', bgCls: 'from-emerald-500/25 to-green-600/10' },
    { icon: Gamepad2, title: L('features.f3_title'), body: L('features.f3_body'), iconCls: 'text-violet-400', bgCls: 'from-violet-500/25 to-purple-600/10' },
    { icon: Gift, title: L('features.f4_title'), body: L('features.f4_body'), iconCls: 'text-amber-400', bgCls: 'from-amber-500/25 to-orange-600/10' },
    { icon: Users, title: L('features.f5_title'), body: L('features.f5_body'), iconCls: 'text-pink-400', bgCls: 'from-pink-500/25 to-rose-600/10' },
    { icon: Wallet, title: L('features.f6_title'), body: L('features.f6_body'), iconCls: 'text-cyan-400', bgCls: 'from-cyan-500/25 to-teal-600/10' },
  ];
}

export function getHowSteps(): { icon: LucideIcon; title: string; body: string }[] {
  return [
    { icon: UserPlus, title: L('how.step1_title'), body: L('how.step1_body') },
    { icon: Pickaxe, title: L('how.step2_title'), body: L('how.step2_body') },
    { icon: TrendingUp, title: L('how.step3_title'), body: L('how.step3_body') },
  ];
}

export function getTestimonials() {
  return [
    { name: L('testimonials.t1_name'), loc: L('testimonials.t1_loc'), text: L('testimonials.t1_text') },
    { name: L('testimonials.t2_name'), loc: L('testimonials.t2_loc'), text: L('testimonials.t2_text') },
    { name: L('testimonials.t3_name'), loc: L('testimonials.t3_loc'), text: L('testimonials.t3_text') },
  ];
}

export function getLandingGames() {
  return [
    {
      title: L('games.g1_name'),
      desc: L('games.g1_desc'),
      gradient: 'from-cyan-500/45 via-sky-600/30 to-blue-700/20',
      titleCls: 'text-cyan-300',
      hoverBorder: 'hover:border-cyan-500/30',
    },
    {
      title: L('games.g2_name'),
      desc: L('games.g2_desc'),
      gradient: 'from-violet-500/45 via-purple-600/30 to-fuchsia-700/20',
      titleCls: 'text-violet-300',
      hoverBorder: 'hover:border-violet-500/30',
    },
    {
      title: L('games.g3_name'),
      desc: L('games.g3_desc'),
      gradient: 'from-amber-500/40 via-orange-600/30 to-red-700/20',
      titleCls: 'text-amber-300',
      hoverBorder: 'hover:border-amber-500/30',
    },
  ];
}

export function getFaqItems(): { id: string; question: string; answer: string }[] {
  return [
    { id: 'faq1', question: L('faq.q1'), answer: L('faq.a1') },
    { id: 'faq2', question: L('faq.q2'), answer: L('faq.a2') },
    { id: 'faq3', question: L('faq.q3'), answer: L('faq.a3') },
    { id: 'faq4', question: L('faq.q4'), answer: L('faq.a4') },
    { id: 'faq5', question: L('faq.q5'), answer: L('faq.a5') },
  ];
}

/** @deprecated Prefer getters above. */
export const featureCards = getFeatureCards();
/** @deprecated Prefer getters above. */
export const howSteps = getHowSteps();
/** @deprecated Prefer getters above. */
export const testimonials = getTestimonials();
/** @deprecated Prefer getters above. */
export const games = getLandingGames();
/** @deprecated Prefer getters above. */
export const faqItems = getFaqItems();
