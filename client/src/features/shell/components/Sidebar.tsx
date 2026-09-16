import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api, useAuthStore } from '../../../shared/auth/auth.store';
import { getActiveOfferEvents, isActiveOffersPayloadLive } from '../../offers/lib/offers.api';
import BrandLogo from '../../../shared/components/BrandLogo';
import { useGameStore } from '../lib/game.store';
import { USER_DASHBOARD_NAV_FALLBACK } from '../nav/userDashboardNav.config';
import { mobileBottomNavItems } from '../nav/sidebarItems';
import {
  isOffersAttentionPath,
  mapApiCategoriesToMenu,
  normalizeMiniPassOutOfRewardsGroup,
  resolveSidebarIcon,
  type SidebarMenuGroup,
  type SidebarMenuLink,
} from '../utils/sidebarNavMap';
import { parsePublicSidebarNavCategories } from '../utils/sidebarNavPublicSchema';
import { pathMatchesNavChild } from '../utils/sidebarPathMatch';
import CommunityShortcuts from './CommunityShortcuts';

/** Debounce between sidebar navigations (matches legacy shell). */
const SIDEBAR_NAVIGATE_DEBOUNCE_MS = 380;
/** Idle budget before starting badge polls (requestIdleCallback timeout). */
const SIDEBAR_BADGE_IDLE_TIMEOUT_MS = 2500;
/** Fallback delay when requestIdleCallback is unavailable. */
const SIDEBAR_BADGE_FALLBACK_DELAY_MS = 1200;
const SIDEBAR_TOURNAMENTS_POLL_MS = 60_000;
const SIDEBAR_ENERGY_TAX_POLL_MS = 5 * 60_000;
const SIDEBAR_OFFERS_POLL_MS = 60_000;
const SIDEBAR_REWARD_INBOX_POLL_MS = 45_000;

const MOBILE_PAGE_ICON: Record<string, string> = {
  dashboard: 'LayoutDashboard',
  machines: 'Cpu',
  shop: 'ShoppingCart',
  wallet: 'Wallet',
};

type SidebarProps = {
  /** Optional external control; when omitted, Sidebar owns mobile open state. */
  mobileOpen?: boolean;
  onNavigate?: () => void;
};

function isMenuGroup(item: SidebarMenuGroup | SidebarMenuLink): item is SidebarMenuGroup {
  return item.type === 'group';
}

type HeaderNotification = {
  id: string | number;
  isRead?: boolean;
  title?: string;
  message?: string;
};

export default function Sidebar({ mobileOpen: mobileOpenProp, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const notifications = useGameStore((s) => s.notifications) as HeaderNotification[];
  const markNotificationRead = useGameStore((s) => s.markNotificationRead);
  const toggleChat = useGameStore((s) => s.toggleChat);
  const hasMention = useGameStore((s) => s.hasMention);

  const [internalOpen, setInternalOpen] = useState(false);
  const mobileOpen = mobileOpenProp ?? internalOpen;
  const setMobileOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      if (mobileOpenProp !== undefined) {
        if (typeof next === 'function') {
          const resolved = next(mobileOpenProp);
          if (!resolved) onNavigate?.();
        } else if (!next) {
          onNavigate?.();
        }
        return;
      }
      setInternalOpen(next);
    },
    [mobileOpenProp, onNavigate],
  );

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({ rewards_group: true });
  const [navCategories, setNavCategories] = useState(() => USER_DASHBOARD_NAV_FALLBACK);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const lastNavAtRef = useRef(0);

  const [activeTournaments, setActiveTournaments] = useState(0);
  const [energyTaxDue, setEnergyTaxDue] = useState(false);
  const [offersLive, setOffersLive] = useState(false);
  const [inboxPending, setInboxPending] = useState(0);

  const unreadCount = (notifications || []).filter((n) => !n.isRead).length;
  const categories = mapApiCategoriesToMenu(normalizeMiniPassOutOfRewardsGroup(navCategories), t);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get('/sidebar/nav');
        if (cancelled) return;
        if (res.data?.ok && Array.isArray(res.data.categories)) {
          const parsed = parsePublicSidebarNavCategories(res.data.categories);
          if (parsed) setNavCategories(parsed);
        }
      } catch {
        /* keep fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let tournamentsTimer: number | undefined;
    let taxTimer: number | undefined;
    let offersTimer: number | undefined;
    let inboxTimer: number | undefined;
    let idleId: number | undefined;
    let fallbackTimer: number | undefined;

    const pollTournaments = async () => {
      try {
        const res = await api.get('/tournaments');
        if (cancelled) return;
        const list = Array.isArray(res.data?.tournaments) ? res.data.tournaments : [];
        setActiveTournaments(list.filter((x: { status?: string }) => x?.status === 'ACTIVE').length);
      } catch {
        /* ignore */
      }
    };

    const pollEnergyTax = async () => {
      try {
        const res = await api.get('/energy-tax/summary');
        if (cancelled) return;
        const due =
          res.data?.active !== false &&
          !res.data?.todayPaid &&
          Number(res.data?.yesterdayRewards ?? 0) > 0;
        setEnergyTaxDue(due);
      } catch {
        /* ignore */
      }
    };

    const pollOffers = async () => {
      try {
        const res = await getActiveOfferEvents();
        if (cancelled) return;
        setOffersLive(isActiveOffersPayloadLive(res.data));
      } catch {
        /* ignore */
      }
    };

    const pollInbox = async () => {
      try {
        const res = await api.get('/reward-inbox');
        if (cancelled) return;
        const items = Array.isArray(res.data?.items)
          ? res.data.items
          : Array.isArray(res.data)
            ? res.data
            : [];
        setInboxPending(items.length);
      } catch {
        /* ignore */
      }
    };

    const start = () => {
      if (cancelled) return;
      void pollTournaments();
      void pollEnergyTax();
      void pollOffers();
      void pollInbox();
      tournamentsTimer = window.setInterval(() => {
        void pollTournaments();
      }, SIDEBAR_TOURNAMENTS_POLL_MS);
      taxTimer = window.setInterval(() => {
        void pollEnergyTax();
      }, SIDEBAR_ENERGY_TAX_POLL_MS);
      offersTimer = window.setInterval(() => {
        void pollOffers();
      }, SIDEBAR_OFFERS_POLL_MS);
      inboxTimer = window.setInterval(() => {
        void pollInbox();
      }, SIDEBAR_REWARD_INBOX_POLL_MS);
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      idleId = w.requestIdleCallback(start, { timeout: SIDEBAR_BADGE_IDLE_TIMEOUT_MS });
    } else {
      fallbackTimer = window.setTimeout(start, SIDEBAR_BADGE_FALLBACK_DELAY_MS);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idleId);
      if (fallbackTimer != null) window.clearTimeout(fallbackTimer);
      if (tournamentsTimer != null) window.clearInterval(tournamentsTimer);
      if (taxTimer != null) window.clearInterval(taxTimer);
      if (offersTimer != null) window.clearInterval(offersTimer);
      if (inboxTimer != null) window.clearInterval(inboxTimer);
    };
  }, []);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setNotificationsOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close drawer on route change only
  }, [location.pathname]);

  const go = useCallback(
    (path: string) => {
      const now = performance.now();
      if (now - lastNavAtRef.current < SIDEBAR_NAVIGATE_DEBOUNCE_MS) return;
      lastNavAtRef.current = now;
      navigate(path);
      setMobileOpen(false);
      onNavigate?.();
    },
    [navigate, onNavigate, setMobileOpen],
  );

  const linkClass = (active: boolean, extra = '') =>
    `w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group ${
      active
        ? 'bg-primary/10 text-primary border border-primary/10'
        : 'text-gray-500 hover:text-white hover:bg-gray-800/40'
    } ${extra}`;

  const renderBadges = (path: string) => (
    <>
      {path === '/tournaments' && activeTournaments > 0 ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-slate-950 px-1.5 min-w-[18px] h-[18px] text-[10px] font-black leading-none shadow-md shadow-amber-500/40 animate-pulse"
          aria-label={t('sidebar.active_tournaments_aria', { count: activeTournaments })}
        >
          {activeTournaments}
        </span>
      ) : null}
      {path === '/inventario' && inboxPending > 0 ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-slate-950 px-1.5 min-w-[18px] h-[18px] text-[10px] font-black leading-none shadow-md shadow-emerald-500/40 animate-pulse"
          aria-label={t('sidebar.inbox_pending_aria', { count: inboxPending })}
        >
          {inboxPending}
        </span>
      ) : null}
      {path === '/taxes' && energyTaxDue ? (
        <span
          className="inline-flex items-center gap-1 rounded bg-orange-500 text-slate-950 px-1.5 h-[16px] text-[9px] font-black tracking-widest uppercase leading-none shadow-md shadow-orange-500/40 animate-pulse"
          aria-label={t('sidebar.energy_tax_pay_today_aria')}
        >
          -25%
        </span>
      ) : null}
      {path === '/offers' && offersLive ? (
        <span
          className="inline-flex items-center gap-1 rounded bg-red-600 text-white px-1.5 h-[16px] text-[9px] font-black tracking-widest uppercase leading-none shadow-md shadow-red-600/40"
          aria-label={t('sidebar.live_offers_aria')}
        >
          <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
          LIVE
        </span>
      ) : null}
    </>
  );

  const renderNavBody = (navId?: string) => (
    <>
      <nav
        className="flex-1 overflow-y-auto px-4 space-y-8 scrollbar-hide py-6"
        id={navId}
      >
        {categories.map((category) => (
          <div key={category.title} className="space-y-2">
            <h3 className="text-[9px] font-black text-gray-600 uppercase tracking-[0.3em] px-4 mb-4">
              {category.title}
            </h3>
            <div className="space-y-1">
              {category.items.map((item) => {
                if (isMenuGroup(item)) {
                  const childActive = item.children.some((ch) =>
                    pathMatchesNavChild(location.pathname, ch.path),
                  );
                  const open = childActive || !!groupOpen[item.key];
                  const isRewards = item.key === 'rewards_group';
                  const toggle = () => {
                    if (childActive) return;
                    setGroupOpen((prev) => ({ ...prev, [item.key]: !prev[item.key] }));
                  };
                  const GroupIcon = item.Icon;
                  const headerBtn = (
                    <button
                      type="button"
                      onClick={toggle}
                      className={linkClass(
                        childActive,
                        isRewards ? 'bg-slate-950/95 border border-blue-500/25' : '',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <GroupIcon
                          className={`w-4 h-4 transition-colors ${childActive ? 'text-primary' : 'group-hover:text-primary'} ${isRewards ? '!text-sky-400' : ''}`}
                        />
                        <span
                          className={`text-xs font-bold uppercase tracking-wide ${childActive ? 'text-white' : ''}`}
                        >
                          {item.label}
                        </span>
                      </div>
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''} ${childActive ? 'text-primary' : 'text-gray-600'}`}
                      />
                    </button>
                  );
                  return (
                    <div key={item.key} className="space-y-1">
                      {isRewards ? (
                        <div className="sidebar-rewards-glow p-[1px]">{headerBtn}</div>
                      ) : (
                        headerBtn
                      )}
                      {open ? (
                        <div className="space-y-1 pl-8">
                          {item.children.map((child) => {
                            const active = pathMatchesNavChild(location.pathname, child.path);
                            const ChildIcon = child.Icon;
                            return (
                              <button
                                key={child.key}
                                type="button"
                                onClick={() => go(child.path)}
                                className={linkClass(active)}
                              >
                                <div className="flex items-center gap-3">
                                  <ChildIcon
                                    className={`w-4 h-4 transition-colors ${active ? 'text-primary' : 'group-hover:text-primary'}`}
                                  />
                                  <span
                                    className={`text-xs font-bold uppercase tracking-wide ${active ? 'text-white' : ''}`}
                                  >
                                    {child.label}
                                  </span>
                                </div>
                                {active ? (
                                  <div className="w-1 h-4 bg-primary rounded-full" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-gray-600" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                const active = location.pathname === item.path;
                const LinkIcon = item.Icon;
                const offersAttention = isOffersAttentionPath(item.path);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => go(item.path)}
                    className={`${linkClass(active)}${offersAttention ? ' sidebar-offers-alert border' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <LinkIcon
                        className={`w-4 h-4 transition-colors ${active ? 'text-primary' : 'group-hover:text-primary'}`}
                      />
                      <span
                        className={`text-xs font-black uppercase tracking-wide ${
                          item.path === '/offers' || active ? 'text-white' : ''
                        }`}
                      >
                        {item.label}
                      </span>
                      {renderBadges(item.path)}
                    </div>
                    {active ? (
                      <div className="w-1 h-4 bg-primary rounded-full" />
                    ) : (
                      <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-gray-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="md:hidden px-4 pb-3">
        <button
          type="button"
          onClick={() => go('/settings')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-800/80 bg-gray-900/40 text-gray-300 hover:text-white hover:bg-gray-800/50 transition-all"
        >
          <Settings className="w-4 h-4 text-sky-400 shrink-0" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wide">{t('sidebar.settings')}</span>
        </button>
      </div>

      <div className="p-4 mt-auto border-t border-gray-800/50">
        <button
          type="button"
          onClick={() => void logout()}
          className="w-full flex items-center gap-3 px-4 py-4 text-gray-500 hover:text-red-400 hover:bg-red-400/5 rounded-2xl transition-all duration-300 group"
        >
          <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="font-bold text-xs uppercase tracking-widest">{t('common.logout')}</span>
        </button>
      </div>
    </>
  );

  const bottomItems = mobileBottomNavItems.map((item) => {
    const iconName = MOBILE_PAGE_ICON[item.page] ?? item.page;
    const Icon: LucideIcon = resolveSidebarIcon(iconName);
    return { icon: Icon, label: t(item.labelKey), path: item.path };
  });

  return (
    <>
      {/* Mobile top chrome (Header is desktop-only). */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-3 h-14 bg-surface border-b border-gray-800/50 shadow-lg">
        <BrandLogo variant="header" />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => toggleChat()}
            className="p-2 text-gray-400 hover:text-white transition-colors relative"
            aria-label={t('sidebar.chat')}
          >
            <MessageSquare className="w-5 h-5" />
            {hasMention ? (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-400 rounded-full" />
            ) : null}
          </button>
          <CommunityShortcuts gapClass="gap-0" />
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((v) => !v)}
              className="p-2 text-gray-400 hover:text-white transition-colors relative"
              aria-label={t('sidebar.notifications')}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 ? (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-surface" />
              ) : null}
            </button>
            {notificationsOpen ? (
              <div className="absolute right-0 mt-2 w-72 bg-surface border border-gray-800 rounded-2xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">
                    {t('sidebar.notifications')}
                  </h3>
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => markNotificationRead('all')}
                      className="text-[10px] font-bold text-primary hover:text-primary-hover uppercase tracking-tighter"
                    >
                      {t('header.mark_all_read')}
                    </button>
                  ) : null}
                </div>
                <div className="max-h-72 overflow-y-auto scrollbar-hide divide-y divide-gray-800/30">
                  {(notifications || []).length === 0 ? (
                    <p className="py-8 text-center text-[10px] text-gray-600 font-bold uppercase tracking-widest italic">
                      {t('sidebar.no_notifications')}
                    </p>
                  ) : (
                    (notifications || []).slice(0, 10).map((n) => (
                      <button
                        key={String(n.id)}
                        type="button"
                        onClick={() => {
                          void markNotificationRead(n.id);
                          setNotificationsOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-gray-800/30 transition-colors ${n.isRead ? '' : 'bg-primary/5'}`}
                      >
                        <p
                          className={`text-xs font-bold truncate ${n.isRead ? 'text-gray-400' : 'text-white'}`}
                        >
                          {n.title}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            aria-label={t('sidebar.menu')}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <button
          type="button"
          role="presentation"
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          aria-label={t('sidebar.menu')}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`md:hidden fixed top-14 bottom-16 left-0 z-40 w-72 bg-surface border-r border-gray-800/50 flex flex-col shadow-2xl transition-transform duration-300 overflow-y-auto ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {renderNavBody()}
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-surface border-t border-gray-800/50 flex items-center justify-around px-1 shadow-2xl supports-[padding:max(0px)]:pb-[max(0px,env(safe-area-inset-bottom))]">
        {bottomItems.map((item) => {
          const active = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => go(item.path)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all duration-300 ${
                active ? 'text-primary' : 'text-gray-500 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[8px] font-black uppercase tracking-widest leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all text-gray-500 hover:text-white"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[8px] font-black uppercase tracking-widest leading-none">
            {t('sidebar.menu')}
          </span>
        </button>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 bg-surface border-r border-gray-800/50 shrink-0 flex-col h-[100dvh] sticky top-0 shadow-2xl relative z-20">
        <div className="p-8">
          <BrandLogo variant="sidebar" />
        </div>
        {renderNavBody('app-main-nav')}
      </aside>
    </>
  );
}
