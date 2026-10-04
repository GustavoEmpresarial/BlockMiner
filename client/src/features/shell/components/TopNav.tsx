import { useEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Cpu,
  Crosshair,
  Eye,
  Flame,
  Gamepad2,
  Gift,
  Globe,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  Link as LinkIcon,
  ListChecks,
  LogOut,
  Map,
  Menu,
  MessageSquare,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  Tag,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  X,
  Youtube,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { api, useAuthStore } from '../../../shared/auth/auth.store';
import { getActiveOfferEvents, isActiveOffersPayloadLive } from '../../offers/lib/offers.api';
import BrandLogo from '../../../shared/components/BrandLogo';
import LanguageSwitcher from '../../../shared/components/LanguageSwitcher';
import { useGameStore } from '../lib/game.store';
import { usePtcSessionStore } from '../../ptc/lib/ptcSession.store';
import { useOfferwallTimerStore } from '../../offerwall/lib/offerwallTimer.store';

const TOPNAV_POLL_INTERVAL_MS = 60_000;
const TOPNAV_NOTIFICATIONS_POLL_MS = 45_000;
const TOPNAV_SUBMENU_FOCUS_DELAY_MS = 50;

interface HeaderNotification {
  id: string | number;
  isRead?: boolean;
  title?: string;
  message?: string;
  type?: string;
  createdAt?: string | number | Date;
}

function PtcGlobalTimer() {
  const session = usePtcSessionStore((s) => s.session);
  const status = usePtcSessionStore((s) => s.status);
  const accumulatedMs = usePtcSessionStore((s) => s.accumulatedMs);
  const isViewing = usePtcSessionStore((s) => s.isViewing);
  const [tick, setTick] = useState(0);
  const viewingStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isViewing) {
      if (viewingStartRef.current == null) viewingStartRef.current = Date.now();
    } else {
      viewingStartRef.current = null;
    }
  }, [isViewing]);

  useEffect(() => {
    if (status !== 'viewing') return;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  const elapsed = useMemo(() => {
    if (!session || !['viewing', 'paused', 'completed', 'opening'].includes(status)) return 0;
    if (status === 'completed') return session.requiredSeconds;
    const liveMs = isViewing && viewingStartRef.current != null ? Date.now() - viewingStartRef.current : 0;
    return Math.min((accumulatedMs + liveMs) / 1000, session.requiredSeconds);
  }, [session, status, accumulatedMs, isViewing, tick]);

  if (!session || status === 'idle' || status === 'claimed') return null;

  if (status === 'completed') {
    return (
      <Link
        to="/ptc"
        className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold uppercase tracking-wider animate-pulse hover:bg-emerald-500/25 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      >
        <Check className="w-3.5 h-3.5" />
        <span>PTC Pronto</span>
      </Link>
    );
  }

  const remaining = Math.max(0, Math.ceil(session.requiredSeconds - elapsed));
  return (
    <Link
      to="/ptc"
      className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/25 text-primary text-[11px] font-mono font-bold hover:bg-primary/20 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
      <span>{remaining}s</span>
    </Link>
  );
}

function OfferwallGlobalTimer() {
  const { t } = useTranslation();
  const isActive = useOfferwallTimerStore((s) => s.isActive);
  const elapsed = useOfferwallTimerStore((s) => s.elapsed);
  const minSec = useOfferwallTimerStore((s) => s.minSec);
  const canSubmit = useOfferwallTimerStore((s) => s.canSubmit);

  if (!isActive) return null;

  const remaining = Math.max(0, Math.ceil(minSec - elapsed));

  if (canSubmit) {
    return (
      <Link
        to="/internal-offerwall"
        className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold uppercase tracking-wider animate-pulse hover:bg-emerald-500/25 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      >
        <Check className="w-3.5 h-3.5" />
        {t('header.offerwall_done', { defaultValue: 'Offerwall Pronto' })}
      </Link>
    );
  }

  return (
    <Link
      to="/internal-offerwall"
      className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-mono font-bold hover:bg-amber-500/20 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      <Clock className="w-3.5 h-3.5" />
      <span>{remaining}s</span>
    </Link>
  );
}

interface NavSubItem {
  id: string;
  labelKey: string;
  path: string;
  icon: LucideIcon;
  badge?: string | number | null;
  badgeColor?: string;
}

interface NavGroup {
  id: string;
  titleKey: string;
  icon: LucideIcon;
  items: NavSubItem[];
}

export default function TopNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const toggleChat = useGameStore((s) => s.toggleChat);
  const hasMention = useGameStore((s) => s.hasMention);
  const notifications = useGameStore((s) => s.notifications) as HeaderNotification[];
  const markNotificationRead = useGameStore((s) => s.markNotificationRead);
  const fetchNotifications = useGameStore((s) => s.fetchNotifications);

  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Live polling state
  const [activeTournaments, setActiveTournaments] = useState(0);
  const [energyTaxDue, setEnergyTaxDue] = useState(false);
  const [offersLive, setOffersLive] = useState(false);
  const [balancePol, setBalancePol] = useState<string | null>(null);

  const navRef = useRef<HTMLElement | null>(null);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const subMenuRefs = useRef<Record<string, (HTMLAnchorElement | null)[]>>({});

  const unreadCount = (notifications || []).filter((n) => !n.isRead).length;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [resT, resTax, resO, resB] = await Promise.allSettled([
          api.get('/tournaments'),
          api.get('/energy-tax/summary'),
          getActiveOfferEvents(),
          api.get('/wallet/balance'),
        ]);

        if (cancelled) return;

        if (resT.status === 'fulfilled') {
          const list = Array.isArray(resT.value.data?.tournaments) ? resT.value.data.tournaments : [];
          setActiveTournaments(list.filter((x: { status?: string }) => x?.status === 'ACTIVE').length);
        }

        if (resTax.status === 'fulfilled') {
          const due =
            resTax.value.data?.active !== false &&
            !resTax.value.data?.todayPaid &&
            Number(resTax.value.data?.yesterdayRewards ?? 0) > 0;
          setEnergyTaxDue(due);
        }

        if (resO.status === 'fulfilled') {
          setOffersLive(isActiveOffersPayloadLive(resO.value.data));
        }

        if (resB.status === 'fulfilled' && resB.value.data) {
          const d = resB.value.data;
          const bal = d.balances?.POL ?? d.balancePol ?? d.balance;
          if (bal != null) setBalancePol(Number(bal).toFixed(2));
        }
      } catch {
        /* quiet fallback */
      }
    };

    void poll();
    const interval = window.setInterval(() => void poll(), TOPNAV_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    void fetchNotifications();
    const interval = window.setInterval(() => void fetchNotifications(), TOPNAV_NOTIFICATIONS_POLL_MS);
    return () => window.clearInterval(interval);
  }, [fetchNotifications]);

  // Click outside closes dropdowns
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (navRef.current && !navRef.current.contains(target)) {
        setActiveGroup(null);
      }
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  // Escape key closes menus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveGroup(null);
        setNotificationsOpen(false);
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 4 Top-level groups organizing all BlockMiner routes
  const navGroups: NavGroup[] = useMemo(
    () => [
      {
        id: 'mining',
        titleKey: 'sidebar.categories.main',
        icon: Cpu,
        items: [
          { id: 'dashboard', labelKey: 'sidebar.dashboard', path: '/dashboard', icon: LayoutDashboard },
          { id: 'machines', labelKey: 'sidebar.machines', path: '/inventory', icon: Cpu },
          { id: 'inventario', labelKey: 'sidebar.inventario', path: '/inventario', icon: Package },
          { id: 'power_stats', labelKey: 'sidebar.power_stats', path: '/power-stats', icon: BarChart3 },
          {
            id: 'taxes',
            labelKey: 'sidebar.taxes',
            path: '/taxes',
            icon: Receipt,
            badge: energyTaxDue ? '!' : null,
            badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          },
        ],
      },
      {
        id: 'earn',
        titleKey: 'sidebar.categories.earn',
        icon: Gamepad2,
        items: [
          {
            id: 'tournaments',
            labelKey: 'sidebar.tournaments',
            path: '/tournaments',
            icon: Crosshair,
            badge: activeTournaments > 0 ? activeTournaments : null,
            badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          },
          { id: 'games', labelKey: 'sidebar.games', path: '/games', icon: Gamepad2 },
          { id: 'checkin', labelKey: 'sidebar.checkin', path: '/checkin', icon: Calendar },
          { id: 'tasks', labelKey: 'sidebar.daily_tasks', path: '/tasks', icon: ListChecks },
          { id: 'mini_pass', labelKey: 'sidebar.mini_pass', path: '/mini-pass', icon: Trophy },
          { id: 'burn', labelKey: 'sidebar.burn', path: '/burn', icon: Flame },
          { id: 'faucet', labelKey: 'sidebar.faucet', path: '/faucet', icon: Gift },
          { id: 'internal_offerwall', labelKey: 'sidebar.internal_offerwall', path: '/internal-offerwall', icon: LayoutGrid },
          { id: 'offerwall', labelKey: 'sidebar.offerwall', path: '/offerwall', icon: Globe },
          { id: 'ptc', labelKey: 'sidebar.ptc_earn', path: '/ptc', icon: Eye },
          { id: 'shortlinks', labelKey: 'sidebar.shortlinks', path: '/shortlinks', icon: LinkIcon },
          { id: 'read_earn', labelKey: 'sidebar.read_earn', path: '/read-earn', icon: Sparkles },
          { id: 'youtube', labelKey: 'sidebar.youtube', path: '/youtube', icon: Youtube },
          { id: 'auto_mining', labelKey: 'sidebar.auto_mining', path: '/auto-mining', icon: Zap },
        ],
      },
      {
        id: 'market',
        titleKey: 'sidebar.shop',
        icon: ShoppingCart,
        items: [
          { id: 'shop', labelKey: 'sidebar.shop', path: '/shop', icon: ShoppingCart },
          {
            id: 'offers',
            labelKey: 'sidebar.offers',
            path: '/offers',
            icon: Tag,
            badge: offersLive ? 'HOT' : null,
            badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
          },
          { id: 'wallet', labelKey: 'sidebar.wallet', path: '/wallet', icon: Wallet },
        ],
      },
      {
        id: 'community',
        titleKey: 'sidebar.categories.social',
        icon: Users,
        items: [
          { id: 'referrals', labelKey: 'sidebar.referrals', path: '/referrals', icon: UserPlus },
          { id: 'social', labelKey: 'sidebar.social_feed', path: '/social', icon: Youtube },
          { id: 'creator', labelKey: 'sidebar.creator', path: '/creator', icon: Star },
          { id: 'ranking', labelKey: 'sidebar.ranking', path: '/ranking', icon: Trophy },
          { id: 'transparency', labelKey: 'sidebar.transparency', path: '/transparency', icon: Eye },
          { id: 'roadmap', labelKey: 'sidebar.roadmap', path: '/roadmap', icon: Map },
          { id: 'manual', labelKey: 'sidebar.manual', path: '/manual', icon: BookOpen },
          { id: 'calculator', labelKey: 'sidebar.calculator', path: '/calculator', icon: BarChart3 },
          { id: 'support', labelKey: 'sidebar.support', path: '/support', icon: LifeBuoy },
        ],
      },
    ],
    [activeTournaments, energyTaxDue, offersLive],
  );

  const currentGroupId = useMemo(() => {
    for (const group of navGroups) {
      if (group.items.some((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))) {
        return group.id;
      }
    }
    return null;
  }, [location.pathname, navGroups]);

  // Keyboard navigation for trigger buttons
  const handleGroupTriggerKeyDown = (e: ReactKeyboardEvent, groupId: string) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveGroup(groupId);
      setTimeout(() => {
        subMenuRefs.current[groupId]?.[0]?.focus();
      }, TOPNAV_SUBMENU_FOCUS_DELAY_MS);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activeGroup === groupId) {
        setActiveGroup(null);
      } else {
        setActiveGroup(groupId);
        setTimeout(() => {
          subMenuRefs.current[groupId]?.[0]?.focus();
        }, TOPNAV_SUBMENU_FOCUS_DELAY_MS);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveGroup(groupId);
      setTimeout(() => {
        const items = subMenuRefs.current[groupId];
        if (items && items.length > 0) items[items.length - 1]?.focus();
      }, TOPNAV_SUBMENU_FOCUS_DELAY_MS);
    } else if (e.key === 'Escape') {
      setActiveGroup(null);
    }
  };

  // Keyboard navigation for submenu items
  const handleSubItemKeyDown = (e: ReactKeyboardEvent, groupId: string, index: number, total: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (index + 1) % total;
      subMenuRefs.current[groupId]?.[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (index - 1 + total) % total;
      subMenuRefs.current[groupId]?.[prev]?.focus();
    } else if (e.key === ' ') {
      e.preventDefault();
      const group = navGroups.find((g) => g.id === groupId);
      const item = group?.items[index];
      if (item) {
        setActiveGroup(null);
        navigate(item.path);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setActiveGroup(null);
      const trigger = document.getElementById(`nav-group-btn-${groupId}`);
      trigger?.focus();
    }
  };

  // Auto-close dropdown when focus leaves group container
  const handleGroupBlur = (e: ReactFocusEvent<HTMLDivElement>, groupId: string) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (activeGroup === groupId) {
        setActiveGroup(null);
      }
    }
  };

  const displayUser =
    (typeof user?.username === 'string' && user.username) ||
    (typeof user?.name === 'string' && user.name) ||
    'Miner';
  const initial =
    typeof user?.name === 'string' && user.name.length > 0
      ? user.name.charAt(0).toUpperCase()
      : typeof user?.username === 'string' && user.username.length > 0
        ? user.username.charAt(0).toUpperCase()
        : 'M';

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  };

  return (
    <>
      {/* ── Desktop & Mobile Top Bar (h-16, fixed, full width) ── */}
      <header
        ref={navRef}
        aria-label="Navegação Principal"
        className="fixed top-0 left-0 right-0 z-40 h-16 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 transition-colors"
      >
        <div className="max-w-7xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Brand Logo (compact container on mobile) */}
          <div className="flex items-center min-w-0 shrink">
            <Link to="/dashboard" className="flex items-center gap-1.5 group shrink min-w-0" aria-label="BlockMiner Home">
              <BrandLogo variant="header" interactive />
            </Link>
          </div>

          {/* Center: Desktop Navigation Groups (hidden on < 1024px) */}
          <nav aria-label="Menu Principal" className="hidden lg:flex items-center gap-1.5 shrink-0">
            {navGroups.map((group) => {
              const isGroupOpen = activeGroup === group.id;
              const isGroupActive = currentGroupId === group.id;
              const Icon = group.icon;
              const hasAlert = group.items.some((it) => it.badge);

              return (
                <div key={group.id} className="relative" onBlur={(e) => handleGroupBlur(e, group.id)}>
                  <button
                    id={`nav-group-btn-${group.id}`}
                    type="button"
                    aria-expanded={isGroupOpen}
                    aria-haspopup="menu"
                    aria-controls={`nav-group-menu-${group.id}`}
                    onClick={() => setActiveGroup(isGroupOpen ? null : group.id)}
                    onKeyDown={(e) => handleGroupTriggerKeyDown(e, group.id)}
                    className={[
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-150 outline-none',
                      'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
                      isGroupActive
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/10'
                        : isGroupOpen
                          ? 'bg-slate-800 text-white border border-slate-700'
                          : 'text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{t(group.titleKey)}</span>
                    {hasAlert && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                    )}
                    <ChevronDown
                      className={`w-3 h-3 shrink-0 transition-transform duration-200 ${isGroupOpen ? 'rotate-180 text-white' : 'text-slate-400'}`}
                      aria-hidden="true"
                    />
                  </button>

                  {/* Dropdown Menu */}
                  {isGroupOpen && (
                    <div
                      id={`nav-group-menu-${group.id}`}
                      role="menu"
                      aria-labelledby={`nav-group-btn-${group.id}`}
                      className="absolute left-0 mt-2 min-w-[240px] rounded-2xl border border-slate-700/80 bg-slate-900/98 backdrop-blur-xl shadow-2xl p-2 z-50 animate-in fade-in-50 zoom-in-95 duration-150"
                    >
                      <div className="space-y-0.5">
                        {group.items.map((sub, idx) => {
                          const SubIcon = sub.icon;
                          const isSubActive = location.pathname === sub.path || location.pathname.startsWith(`${sub.path}/`);

                          return (
                            <Link
                              key={sub.id}
                              ref={(el) => {
                                if (!subMenuRefs.current[group.id]) subMenuRefs.current[group.id] = [];
                                subMenuRefs.current[group.id][idx] = el;
                              }}
                              to={sub.path}
                              role="menuitem"
                              tabIndex={isGroupOpen ? 0 : -1}
                              onClick={() => setActiveGroup(null)}
                              onKeyDown={(e) => handleSubItemKeyDown(e, group.id, idx, group.items.length)}
                              className={[
                                'flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs transition-colors outline-none',
                                'focus-visible:ring-2 focus-visible:ring-primary focus-visible:bg-slate-800',
                                isSubActive
                                  ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30'
                                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80 font-medium',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <SubIcon className={`w-3.5 h-3.5 shrink-0 ${isSubActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                                <span className="truncate">{t(sub.labelKey)}</span>
                              </div>
                              {sub.badge && (
                                <span
                                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider ${sub.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'}`}
                                >
                                  {sub.badge}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Right Section: Prioritized controls (fits safely in 320px) */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-auto">
            {/* Desktop Timers */}
            <OfferwallGlobalTimer />
            <PtcGlobalTimer />

            {/* Desktop Community Chat */}
            <button
              type="button"
              onClick={toggleChat}
              className="hidden lg:flex p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors relative outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              title={t('header.community')}
              aria-label="Abrir Chat"
            >
              <MessageSquare className="w-4 h-4" />
              {hasMention && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />}
            </button>

            {/* Notifications Bell (visible on all screens) */}
            <div className="relative" ref={notificationRef}>
              <button
                type="button"
                aria-expanded={notificationsOpen}
                aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`}
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className={`p-2 rounded-xl transition-colors relative outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${notificationsOpen ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/80'}`}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-slate-950 animate-pulse" />
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-700/80 bg-slate-900/98 backdrop-blur-xl shadow-2xl overflow-hidden z-50 animate-in fade-in-50 zoom-in-95 duration-150">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                    <span className="text-xs font-black text-white uppercase tracking-widest">{t('header.notifications')}</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead('all')}
                        className="text-[10px] font-bold text-primary hover:text-primary-hover uppercase tracking-wider outline-none focus-visible:underline"
                      >
                        {t('header.mark_all_read')}
                      </button>
                    )}
                  </div>
                  <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-800/40">
                    {(notifications || []).length === 0 ? (
                      <div className="py-8 text-center text-slate-400">
                        <Inbox className="w-8 h-8 mx-auto opacity-40 mb-2" />
                        <p className="text-[11px] font-bold uppercase tracking-wider">{t('header.no_alerts')}</p>
                      </div>
                    ) : (
                      (notifications || []).map((n) => (
                        <div
                          key={String(n.id)}
                          onClick={() => markNotificationRead(n.id)}
                          className={`p-3.5 hover:bg-slate-800/50 cursor-pointer transition-colors ${!n.isRead ? 'bg-primary/5' : ''}`}
                        >
                          <p className="text-xs font-bold text-slate-100">{n.title}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Desktop Language Switcher */}
            <div className="hidden lg:block">
              <LanguageSwitcher />
            </div>

            {/* Balance Pill (Compact on mobile, full on desktop) */}
            <Link
              to="/wallet"
              className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 text-[11px] sm:text-xs font-bold text-slate-100 shadow-sm transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 shrink-0"
              title="Ver Carteira"
              aria-label={`Saldo: ${balancePol ? `${balancePol} POL` : 'Carteira'}`}
            >
              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[64px] sm:max-w-none">{balancePol ? `${balancePol} POL` : '0.00 POL'}</span>
            </Link>

            {/* Desktop User Avatar (moved into drawer on mobile) */}
            <Link
              to="/settings"
              className="hidden lg:flex w-9 h-9 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 items-center justify-center text-white text-xs font-black shadow-sm transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 shrink-0"
              title={displayUser}
              aria-label={`Definições do perfil de ${displayUser}`}
            >
              {initial}
            </Link>

            {/* Desktop Sair / Logout Button (moved into drawer on mobile) */}
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="hidden lg:flex w-9 h-9 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-400 hover:text-red-300 items-center justify-center transition-all duration-150 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 shrink-0"
              title={t('common.logout')}
              aria-label={t('common.logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile Hamburger Button (< 1024px) - GUARANTEED ALWAYS VISIBLE & RIGHTMOST */}
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-expanded={mobileDrawerOpen}
              aria-label="Abrir menu de navegação completo"
              className="lg:hidden p-2 rounded-xl border border-slate-700/80 bg-slate-800/90 text-slate-300 hover:text-white transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Navigation Drawer (Mounted in Portal) ── */}
      {mobileDrawerOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu de Navegação Mobile"
            className="fixed inset-0 z-50 flex justify-end animate-in fade-in duration-200"
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileDrawerOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer Body */}
            <div className="relative w-[min(340px,85vw)] h-full bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col z-10 overflow-hidden animate-in slide-in-from-right duration-250">
              {/* Drawer Header */}
              <div className="h-16 px-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/60">
                <BrandLogo variant="header" />
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Fechar menu"
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Profile Card */}
              <div className="p-4 border-b border-slate-800 bg-slate-900/40 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white text-xs font-black shrink-0">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{displayUser}</p>
                    <p className="text-[11px] text-slate-400 truncate">{user?.email || 'miner@blockminer.space'}</p>
                  </div>
                </div>
                <Link
                  to="/settings"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title={t('header.settings', { defaultValue: 'Definições' })}
                  aria-label="Definições de Perfil"
                >
                  <Settings className="w-4 h-4" />
                </Link>
              </div>

              {/* Drawer Navigation Links */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {navGroups.map((group) => {
                  const GroupIcon = group.icon;
                  return (
                    <div key={group.id} className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400 px-2">
                        <GroupIcon className="w-3.5 h-3.5 text-primary" />
                        <span>{t(group.titleKey)}</span>
                      </div>
                      <div className="space-y-1">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          const isItemActive = location.pathname === item.path;
                          return (
                            <Link
                              key={item.id}
                              to={item.path}
                              onClick={() => setMobileDrawerOpen(false)}
                              className={[
                                'flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors outline-none',
                                'focus-visible:ring-2 focus-visible:ring-primary',
                                isItemActive
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <ItemIcon className={`w-3.5 h-3.5 shrink-0 ${isItemActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                                <span className="truncate">{t(item.labelKey)}</span>
                              </div>
                              {item.badge && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-black border uppercase tracking-wider ${item.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'}`}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Mobile Drawer Bottom Actions */}
                <div className="pt-4 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <span className="text-xs font-bold text-slate-400">Idioma:</span>
                    <LanguageSwitcher />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      void handleLogout();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-bold uppercase tracking-wider hover:bg-red-500/25 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{t('common.logout')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Mobile Ergonomic Bottom Nav (Thumb actions for < 1024px) ── */}
      <nav
        aria-label="Navegação Rápida Inferior"
        className="fixed bottom-0 left-0 right-0 h-16 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 z-30 lg:hidden flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]"
      >
        {[
          { page: 'dashboard', labelKey: 'sidebar.mobile_home', path: '/dashboard', icon: LayoutDashboard },
          { page: 'machines', labelKey: 'sidebar.mobile_machines', path: '/inventory', icon: Cpu },
          { page: 'tasks', labelKey: 'sidebar.daily_tasks', path: '/tasks', icon: ListChecks },
          { page: 'shop', labelKey: 'sidebar.shop', path: '/shop', icon: ShoppingCart },
          { page: 'wallet', labelKey: 'sidebar.wallet', path: '/wallet', icon: Wallet },
        ].map((item) => {
          const ItemIcon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.page}
              to={item.path}
              className={[
                'flex flex-col items-center justify-center gap-1 w-14 py-1 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary',
                isActive ? 'text-emerald-400 font-bold' : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
              aria-current={isActive ? 'page' : undefined}
            >
              <ItemIcon className="w-5 h-5 shrink-0" />
              <span className="text-[10px] leading-none tracking-tight">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
