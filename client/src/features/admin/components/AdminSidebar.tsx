import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Cpu,
  Wallet,
  Database,
  FileText,
  Activity,
  LogOut,
  ShieldAlert,
  Tag,
  MessageSquare,
  HelpCircle,
  Megaphone,
  Youtube,
  Eye,
  TrendingUp,
  BarChart2,
  Bell,
  CalendarRange,
  BookOpen,
  Layers,
  PanelLeft,
  ListChecks,
  LayoutGrid,
  Fingerprint,
  MousePointerClick,
  Trophy,
  Flame,
  ChevronDown,
  Gauge,
  HeartHandshake,
  Coins,
  Pickaxe,
  Boxes,
  Gift,
  Droplets,
  Sparkles,
  Settings,
  Users2,
  ClipboardList,
  BrainCircuit,
  UserCircle2,
} from 'lucide-react';
import { adminLogout } from '../../admin-auth/index';
import { clearAdminAuthCache } from '../../admin-auth/lib/adminAuth.cache';

type AdminMenuEntry = {
  icon: LucideIcon;
  labelKey: string;
  path: string;
  /** Screens not yet ported into current/ — kept visible for structural fidelity with
   * legacy's sidebar, but disabled instead of navigating to a 404. */
  disabled?: boolean;
};

type AdminMenuSection = {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  items: AdminMenuEntry[];
};

/** Full legacy section/item map. Overview + users are live; remaining items stay
 * disabled (honest "não migrado ainda") until each module lands. */
const ADMIN_MENU_SECTIONS: AdminMenuSection[] = [
  {
    id: 'overview',
    labelKey: 'adminSidebar.section.overview',
    icon: Gauge,
    items: [
      { icon: LayoutDashboard, labelKey: 'adminSidebar.nav.overview', path: '/admin/dashboard' },
      { icon: TrendingUp, labelKey: 'adminSidebar.nav.analytics', path: '/admin/analytics' },
      { icon: BarChart2, labelKey: 'adminSidebar.nav.traffic', path: '/admin/traffic' },
      { icon: Activity, labelKey: 'adminSidebar.nav.metrics', path: '/admin/metrics' },
    ],
  },
  {
    id: 'users',
    labelKey: 'adminSidebar.section.users',
    icon: Users,
    items: [
      { icon: Users, labelKey: 'adminSidebar.nav.users', path: '/admin/users' },
      { icon: Fingerprint, labelKey: 'adminSidebar.nav.fraud_signals', path: '/admin/fraud-signals' },
      { icon: ShieldAlert, labelKey: 'adminSidebar.nav.antibot', path: '/admin/antibot' },
    ],
  },
  {
    id: 'support',
    labelKey: 'adminSidebar.section.support',
    icon: HeartHandshake,
    items: [
      { icon: MessageSquare, labelKey: 'adminSidebar.nav.support', path: '/admin/support' },
      { icon: HelpCircle, labelKey: 'adminSidebar.nav.public_support', path: '/admin/public-support' },
      { icon: PanelLeft, labelKey: 'adminSidebar.nav.user_app_sidebar', path: '/admin/user-sidebar' },
    ],
  },
  {
    id: 'economy',
    labelKey: 'adminSidebar.section.economy',
    icon: Coins,
    items: [
      { icon: Wallet, labelKey: 'adminSidebar.nav.finance', path: '/admin/finance' },
      { icon: Eye, labelKey: 'adminSidebar.nav.transparency', path: '/admin/transparency' },
      { icon: TrendingUp, labelKey: 'adminSidebar.nav.transparency_investments', path: '/admin/transparency/investments' },
      { icon: Flame, labelKey: 'adminSidebar.nav.burn_events', path: '/admin/burn-events' },
    ],
  },
  {
    id: 'mining',
    labelKey: 'adminSidebar.section.mining',
    icon: Pickaxe,
    items: [
      { icon: Cpu, labelKey: 'adminSidebar.nav.miners', path: '/admin/miners' },
      { icon: Boxes, labelKey: 'adminSidebar.nav.sala', path: '/admin/sala' },
      { icon: Layers, labelKey: 'adminSidebar.nav.mini_pass', path: '/admin/mini-pass' },
      { icon: CalendarRange, labelKey: 'adminSidebar.nav.checkin_milestones', path: '/admin/checkin-milestones' },
    ],
  },
  {
    id: 'rewards',
    labelKey: 'adminSidebar.section.rewards',
    icon: Gift,
    items: [
      { icon: Tag, labelKey: 'adminSidebar.nav.offers', path: '/admin/offer-events' },
      { icon: LayoutGrid, labelKey: 'adminSidebar.nav.internal_offerwall', path: '/admin/internal-offerwall' },
      { icon: BarChart2, labelKey: 'adminSidebar.nav.offerwall_analytics', path: '/admin/offerwall-analytics' },
      { icon: ListChecks, labelKey: 'adminSidebar.nav.daily_tasks', path: '/admin/daily-tasks' },
      { icon: MousePointerClick, labelKey: 'adminSidebar.nav.ptc', path: '/admin/ptc' },
      { icon: BookOpen, labelKey: 'adminSidebar.nav.read_earn', path: '/admin/read-earn' },
      { icon: Droplets, labelKey: 'adminSidebar.nav.faucet', path: '/admin/faucet' },
    ],
  },
  {
    id: 'engagement',
    labelKey: 'adminSidebar.section.engagement',
    icon: Sparkles,
    items: [
      { icon: Trophy, labelKey: 'adminSidebar.nav.tournaments', path: '/admin/tournaments' },
      { icon: Megaphone, labelKey: 'adminSidebar.nav.banners', path: '/admin/banners' },
      { icon: Youtube, labelKey: 'adminSidebar.nav.creators_social', path: '/admin/creators' },
    ],
  },
  {
    id: 'system',
    labelKey: 'adminSidebar.section.system',
    icon: Settings,
    items: [
      { icon: BrainCircuit, labelKey: 'adminSidebar.nav.ai_health', path: '/admin/ai-health' },
      { icon: FileText, labelKey: 'adminSidebar.nav.logs', path: '/admin/logs' },
      { icon: FileText, labelKey: 'adminSidebar.nav.client_errors', path: '/admin/client-errors' },
      { icon: Database, labelKey: 'adminSidebar.nav.backups', path: '/admin/backups' },
      { icon: Bell, labelKey: 'adminSidebar.nav.broadcast', path: '/admin/broadcast' },
    ],
  },
  {
    id: 'administration',
    labelKey: 'adminSidebar.section.administration',
    icon: Users2,
    items: [
      { icon: Users2, labelKey: 'adminSidebar.nav.admin_users', path: '/admin/admins' },
      { icon: ClipboardList, labelKey: 'adminSidebar.nav.admin_audit', path: '/admin/admin-audit' },
      { icon: UserCircle2, labelKey: 'adminSidebar.nav.my_profile', path: '/admin/profile' },
    ],
  },
];

const STORAGE_KEY = 'admin-sidebar-open-sections';

function isItemActive(itemPath: string, pathname: string): boolean {
  if (pathname === itemPath) return true;
  if (itemPath === '/admin/dashboard') return false;
  return pathname.startsWith(`${itemPath}/`);
}

function sectionContainsActive(section: AdminMenuSection, pathname: string): boolean {
  return section.items.some((it) => isItemActive(it.path, pathname));
}

function loadOpenSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* empty */
  }
  return {};
}

export type AdminSidebarProps = {
  mobileOpen?: boolean;
  onNavigate?: () => void;
};

export default function AdminSidebar({ mobileOpen = false, onNavigate }: AdminSidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const activeSectionId = useMemo(
    () => ADMIN_MENU_SECTIONS.find((s) => sectionContainsActive(s, location.pathname))?.id ?? 'overview',
    [location.pathname],
  );

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const stored = loadOpenSections();
    const seed: Record<string, boolean> = {};
    for (const s of ADMIN_MENU_SECTIONS) {
      seed[s.id] = stored[s.id] ?? false;
    }
    seed[activeSectionId] = true;
    return seed;
  });

  useEffect(() => {
    setOpenMap((prev) => (prev[activeSectionId] ? prev : { ...prev, [activeSectionId]: true }));
  }, [activeSectionId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(openMap));
    } catch {
      /* empty */
    }
  }, [openMap]);

  const handleLogout = () => {
    clearAdminAuthCache();
    void adminLogout().finally(() => {
      navigate('/admin/login');
      onNavigate?.();
    });
  };

  const go = (item: AdminMenuEntry) => {
    if (item.disabled) return;
    navigate(item.path);
    onNavigate?.();
  };

  const toggleSection = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const slideClass = mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0';

  return (
    <aside
      className={`bg-slate-900 border-r border-slate-800 p-4 sm:p-6 shrink-0 flex flex-col self-stretch min-h-0 max-h-[100dvh] h-[100dvh] shadow-2xl overflow-hidden w-[min(22rem,90vw)] sm:w-72 max-w-sm fixed inset-y-0 left-0 z-40 lg:static lg:inset-auto lg:max-w-none transition-transform duration-200 ease-out will-change-transform ${slideClass}`}
    >
      <div className="flex items-center gap-3 mb-6 px-2 shrink-0">
        <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
          <ShieldAlert className="text-white w-6 h-6" aria-hidden />
        </div>
        <span className="font-black text-xl tracking-tighter text-white uppercase">
          {t('adminSidebar.brand_admin')}
          <span className="text-amber-500">{t('adminSidebar.brand_panel')}</span>
        </span>
      </div>

      <nav
        id="admin-main-nav"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth space-y-2 pr-1 py-0.5 [scrollbar-gutter:stable]"
        aria-label={t('adminSidebar.aria_main_nav')}
      >
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2 mb-3 shrink-0">
          {t('adminSidebar.section_management')}
        </p>
        {ADMIN_MENU_SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          const open = !!openMap[section.id];
          const hasActive = sectionContainsActive(section, location.pathname);
          return (
            <div key={section.id} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={open}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl transition-colors ${
                  hasActive ? 'text-amber-500 bg-amber-500/5' : 'text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <SectionIcon className="w-4 h-4 shrink-0" aria-hidden />
                  <span className="font-black text-[11px] uppercase tracking-widest">{t(section.labelKey)}</span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
                  aria-hidden
                />
              </button>

              {open ? (
                <div className="ml-1 pl-2 border-l border-slate-800 space-y-1">
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;
                    const isActive = isItemActive(item.path, location.pathname);
                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => go(item)}
                        disabled={item.disabled}
                        title={item.disabled ? t('adminSidebar.not_migrated') : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                          item.disabled
                            ? 'text-slate-600 cursor-not-allowed opacity-50'
                            : isActive
                              ? 'bg-amber-500/10 text-amber-500 shadow-sm'
                              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                      >
                        <ItemIcon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive && !item.disabled ? 'text-amber-500' : 'group-hover:text-white'
                          }`}
                          aria-hidden
                        />
                        <span className="font-semibold text-[13px] text-left">{t(item.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 pt-6 border-t border-slate-800">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-400 hover:bg-red-400/5 rounded-xl transition-all duration-300 group"
        >
          <LogOut className="w-5 h-5 shrink-0 group-hover:rotate-12 transition-transform" aria-hidden />
          <span className="font-bold text-xs uppercase tracking-widest">{t('adminSidebar.logout')}</span>
        </button>
      </div>
    </aside>
  );
}
