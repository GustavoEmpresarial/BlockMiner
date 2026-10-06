import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import {
  Bell,
  LayoutDashboard,
  Search,
  Settings,
  MessageSquare,
  Check,
  Info,
  AlertTriangle,
  TrendingUp,
  Inbox,
  Clock,
  CheckCircle2,
  PauseCircle,
} from 'lucide-react';
import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../lib/game.store';
import { useAuthStore } from '../../../shared/auth/auth.store';
import CommunityShortcuts from './CommunityShortcuts';
import { usePtcSessionStore } from '../../ptc/lib/ptcSession.store';
import { useOfferwallTimerStore } from '../../offerwall/lib/offerwallTimer.store';
import LanguageSwitcher from '../../../shared/components/LanguageSwitcher';

function headerActionGhost(active = false): string {
  return `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
    active
      ? 'bg-slate-800 text-white'
      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
  }`;
}

function fmtPtcTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, accumulatedMs, isViewing, tick]);

  if (!session || status === 'idle' || status === 'claimed') return null;

  const requiredSeconds = session.requiredSeconds;
  const pct = Math.min(100, (elapsed / requiredSeconds) * 100);

  if (status === 'cancelled') {
    return (
      <Link
        to="/ptc"
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        PTC Cancelado
      </Link>
    );
  }

  if (status === 'completed') {
    return (
      <Link
        to="/ptc"
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors animate-pulse"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        PTC Pronto — Resgatar
      </Link>
    );
  }

  const isPaused = status === 'paused' || status === 'opening' || (status === 'viewing' && !isViewing);

  return (
    <Link
      to="/ptc"
      className={`hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
        isPaused
          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
          : 'bg-sky-500/10 border-sky-500/20 text-sky-400 hover:bg-sky-500/20'
      }`}
    >
      {isPaused ? (
        <PauseCircle className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
      )}
      <span className="tabular-nums">
        {fmtPtcTime(elapsed)} / {fmtPtcTime(requiredSeconds)}
      </span>
      <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isPaused ? 'bg-amber-400' : 'bg-sky-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

interface HeaderNotification {
  id: string | number;
  isRead?: boolean;
  type?: string;
  title?: string;
  message?: string;
  createdAt?: string | number | Date;
}

function OfferwallGlobalTimer() {
  const { t } = useTranslation();
  const isActive = useOfferwallTimerStore((s) => s.isActive);
  const elapsed = useOfferwallTimerStore((s) => s.elapsed);
  const minSec = useOfferwallTimerStore((s) => s.minSec);
  const isPaused = useOfferwallTimerStore((s) => s.isPaused);
  const canSubmit = useOfferwallTimerStore((s) => s.canSubmit);

  if (!isActive) return null;

  const pct = minSec > 0 ? Math.min(100, (elapsed / minSec) * 100) : 0;

  if (canSubmit) {
    return (
      <Link
        to="/internal-offerwall"
        className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors animate-pulse"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t('header.offerwall_done')}
      </Link>
    );
  }

  return (
    <Link
      to="/internal-offerwall"
      className={`hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
        isPaused
          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
          : 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/20'
      }`}
    >
      {isPaused ? (
        <PauseCircle className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
      )}
      <span className="tabular-nums">
        {fmtPtcTime(elapsed)} / {fmtPtcTime(minSec)}
      </span>
      <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isPaused ? 'bg-amber-400' : 'bg-purple-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Link>
  );
}

export default function Header() {
  const { t } = useTranslation();
  const location = useLocation();
  const toggleChat = useGameStore((state) => state.toggleChat);
  const notifications = useGameStore((state) => state.notifications) as HeaderNotification[];
  const markNotificationRead = useGameStore((state) => state.markNotificationRead);
  const fetchNotifications = useGameStore((state) => state.fetchNotifications);
  const user = useAuthStore((state) => state.user);

  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);

  const getPageTitle = (): string => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return t('pages.overview');

    const key = `pages.${segments[0].replace('-', '_')}`;
    const translated = t(key);

    if (translated !== key) return translated;
    return t('pages.overview');
  };

  const title = getPageTitle();
  const unreadCount = (notifications || []).filter((n) => !n.isRead).length;

  useEffect(() => {
    void fetchNotifications();
    // Fallback poll: the socket push (game.store.ts 'notification:new') is the fast path, but a
    // reconnect gap (e.g. right after a server restart) can miss it silently — this 45s poll is
    // what actually surfaces a missed pop-up, since fetchNotifications() only used to run once
    // on mount. See its own dedupe logic (seenNotificationIds) for why this doesn't re-toast.
    const interval = window.setInterval(() => void fetchNotifications(), 45_000);
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (notificationRef.current && !notificationRef.current.contains(target)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [fetchNotifications]);

  const handleMarkAllRead = () => {
    markNotificationRead('all');
  };

  const getNotificationIcon = (type: string | undefined): ReactNode => {
    switch (type) {
      case 'success':
        return <Check className="w-4 h-4 text-emerald-400" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'reward':
        return <TrendingUp className="w-4 h-4 text-primary" />;
      default:
        return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const displayUser =
    (typeof user?.username === 'string' && user.username) ||
    (typeof user?.name === 'string' && user.name) ||
    '';
  const initial =
    typeof user?.name === 'string' && user.name.length > 0
      ? user.name.charAt(0).toUpperCase()
      : typeof user?.username === 'string' && user.username.length > 0
        ? user.username.charAt(0).toUpperCase()
        : '?';

  return (
    <header className="hidden md:flex h-20 min-w-0 items-center border-b-2 border-slate-800 bg-gradient-to-br from-[#0c1220] via-slate-900 to-[#101b33] px-8 backdrop-blur-md sticky top-0 z-30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.15),transparent_60%)]" aria-hidden />
      <div className="relative flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-primary/30 bg-primary/15 shadow-[2px_2px_0px_#000000]">
          <LayoutDashboard className="h-5 w-5 text-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" aria-hidden />
        </div>
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-xl font-bold text-white tracking-tight">{title}</p>
          <p className="text-[11px] text-slate-400 font-medium">{t('header.protocol_active')}</p>
        </div>
      </div>

      <div className="relative ml-auto flex min-w-0 items-center gap-6">
        <OfferwallGlobalTimer />
        <PtcGlobalTimer />

        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder={t('header.search_placeholder')}
            className="w-64 rounded-xl border-2 border-slate-800 bg-slate-900/60 py-2 pl-10 pr-4 text-sm text-slate-300 shadow-[2px_2px_0px_#000000] transition-colors focus:border-primary/50 focus:outline-none focus:shadow-[0_0_18px_rgba(59,130,246,0.35),2px_2px_0px_#000000]"
          />
        </div>

        <div className="flex min-w-0 items-center gap-3 border-l border-slate-800 pl-6">
          <button
            type="button"
            onClick={toggleChat}
            className={`${headerActionGhost()} relative`}
            title={t('header.community')}
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <CommunityShortcuts gapClass="gap-0.5" variant="ghost" />

          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className={`${headerActionGhost(isNotificationsOpen)} relative`}
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background animate-pulse" />
              )}
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-3 w-80 bg-slate-900/60 border-2 border-slate-800 rounded-3xl shadow-[4px_4px_0px_#000000] overflow-hidden z-50">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest">{t('header.notifications')}</h3>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[10px] font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-tighter"
                    >
                      {t('header.mark_all_read')}
                    </button>
                  )}
                </div>

                <div className="max-h-[400px] overflow-y-auto scrollbar-hide">
                  {(notifications || []).length === 0 ? (
                    <div className="py-12 flex flex-col items-center justify-center text-slate-400 space-y-3">
                      <Inbox className="w-10 h-10 opacity-20" />
                      <p className="text-[10px] font-bold uppercase tracking-widest italic">
                        {t('header.no_alerts')}
                      </p>
                    </div>
                  ) : (
                    (notifications || []).map((n: HeaderNotification) => (
                      <div
                        key={String(n.id)}
                        className={`px-6 py-4 border-b border-slate-800/30 hover:bg-slate-800/30 transition-colors relative group ${!n.isRead ? 'bg-primary/5' : ''}`}
                        onClick={() => markNotificationRead(n.id)}
                      >
                        <div className="flex gap-4">
                          <div
                            className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center bg-primary/10 border border-primary/25 text-primary shadow-[2px_2px_0px_#000000]"
                          >
                            {getNotificationIcon(n.type)}
                          </div>
                          <div className="space-y-1 min-w-0">
                            <p
                              className={`text-xs font-bold leading-tight truncate ${!n.isRead ? 'text-white' : 'text-gray-400'}`}
                            >
                              {n.title}
                            </p>
                            <p className="text-[11px] text-gray-500 leading-normal line-clamp-2">{n.message}</p>
                            <p className="text-[9px] text-slate-400 font-medium">
                              {new Date(n.createdAt ?? 0).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                        {!n.isRead && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-primary rounded-full" />
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="px-6 py-3 bg-slate-950/40 text-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    {t('header.intelligence')}
                  </span>
                </div>
              </div>
            )}
          </div>

          <LanguageSwitcher />

          <Link
            to="/settings"
            className={headerActionGhost()}
            title={t('header.settings')}
          >
            <Settings className="w-5 h-5" />
          </Link>

          <div className="flex items-center gap-3 pl-3 ml-2 border-l border-slate-800">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-black text-white leading-none tracking-tighter uppercase italic">
                {displayUser}
              </span>
              <span className="text-[9px] font-bold text-primary uppercase tracking-[0.2em] mt-1">
                {t('header.level', { n: 1 })}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black border-2 border-slate-800 shadow-[2px_2px_0px_#000000] overflow-hidden">
              {initial}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
