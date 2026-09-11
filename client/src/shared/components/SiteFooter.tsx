import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Compass, MessageCircle, Send, ShieldCheck, Sparkles, Twitter, Youtube } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { normalizeExternalUrl } from './CommunityShortcuts';

/**
 * THE ONE site footer. Every page uses this exact component — there used to be three
 * different footers (a plain shared one nobody imported, a hand-rolled compact one in
 * AuthShell, and this full design living only inline in the landing page) that all looked
 * and behaved differently depending on which page you were on. Consolidated 2026-09-11 per
 * explicit request: one look, one component, everywhere.
 *
 * Self-contained on purpose — no required props. Reads the same social-link env vars the
 * landing page used to pass in manually, and its own `t()`, so any page can drop in
 * `<SiteFooter />` with zero wiring.
 */
export default function SiteFooter() {
  const { t } = useTranslation();

  const discordUrl = normalizeExternalUrl(import.meta.env.VITE_DISCORD_URL) || 'https://discord.gg/7Ge9vd8E';
  const telegramUrl = normalizeExternalUrl(import.meta.env.VITE_TELEGRAM_URL) || 'https://t.me/+KPgyUFtKCZ00Y2Vh';
  const twitterUrl = normalizeExternalUrl(import.meta.env.VITE_TWITTER_URL);
  const youtubeUrl = normalizeExternalUrl(import.meta.env.VITE_YOUTUBE_URL);

  const socialLinks = [
    { href: discordUrl, label: t('landing.footer.social_discord'), Icon: MessageCircle },
    { href: telegramUrl, label: t('landing.footer.social_telegram'), Icon: Send },
    ...(twitterUrl ? [{ href: twitterUrl, label: t('landing.footer.social_twitter'), Icon: Twitter }] : []),
    ...(youtubeUrl ? [{ href: youtubeUrl, label: t('landing.footer.social_youtube'), Icon: Youtube }] : []),
  ];

  const scrollToTop = () => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="relative z-10 overflow-hidden border-t border-white/[0.07] bg-[#02070f] px-5 py-16 text-white sm:px-8">
      {/* Faint brand glow, same family as the hero/auth pages — keeps the footer from
          reading as a flat, disconnected slab at the bottom of the page. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[min(600px,90vw)] -translate-x-1/2 rounded-full bg-sky-600/[0.06] blur-3xl"
        aria-hidden
      />

      <div className="relative mx-auto grid max-w-6xl gap-12 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <BrandLogo variant="header" interactive />
          <p className="mt-4 max-w-xs text-sm leading-6 text-white">{t('landing.footer.tagline')}</p>
          <p className="mt-3 max-w-xs text-xs leading-5 text-white/80">{t('landing.footer.disclaimer')}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {socialLinks.map(({ href, label, Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white transition-all duration-150 hover:border-sky-400/30 hover:bg-white/10"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
            <Compass className="h-3.5 w-3.5 text-sky-500/70" aria-hidden />
            {t('landing.footer.col_product')}
          </p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/#how-it-works" className="transition-colors hover:text-sky-400">{t('landing.footer.link_how')}</Link></li>
            <li><Link to="/games" className="transition-colors hover:text-sky-400">{t('landing.footer.link_games')}</Link></li>
            <li><Link to="/calculator" className="transition-colors hover:text-sky-400">{t('landing.footer.link_calc')}</Link></li>
            <li><Link to="/transparency" className="transition-colors hover:text-sky-400">{t('landing.footer.link_transparency')}</Link></li>
          </ul>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
            <Sparkles className="h-3.5 w-3.5 text-sky-500/70" aria-hidden />
            {t('landing.footer.col_company')}
          </p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/roadmap" className="transition-colors hover:text-sky-400">{t('landing.footer.link_roadmap')}</Link></li>
            <li><Link to="/manual" className="transition-colors hover:text-sky-400">{t('landing.footer.link_manual')}</Link></li>
            <li><Link to="/register" className="transition-colors hover:text-sky-400">{t('landing.nav.register')}</Link></li>
          </ul>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70" aria-hidden />
            {t('landing.footer.col_legal')}
          </p>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/terms-of-use" className="transition-colors hover:text-sky-400">{t('legal.footer.termsOfUse')}</Link></li>
            <li><Link to="/privacy-policy" className="transition-colors hover:text-sky-400">{t('legal.footer.privacyPolicy')}</Link></li>
            <li><Link to="/cookie-policy" className="transition-colors hover:text-sky-400">{t('legal.footer.cookiePolicy')}</Link></li>
          </ul>
        </div>
      </div>

      <div className="relative mx-auto mt-12 flex max-w-6xl flex-col-reverse items-center gap-4 border-t border-white/[0.07] pt-8 sm:flex-row sm:justify-between">
        <p className="text-sm">{t('landing.footer.copyright', { year: new Date().getFullYear() })}</p>
        <button
          type="button"
          onClick={scrollToTop}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:border-sky-400/30 hover:bg-white/5"
        >
          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
          {t('landing.footer.back_to_top')}
        </button>
      </div>
    </footer>
  );
}
