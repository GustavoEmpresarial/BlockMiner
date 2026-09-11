import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Ban, KeyRound, Loader2, ShieldOff, Unlock, Wallet, X } from 'lucide-react';
import { resolveApiErrorMessage } from '../../../../shared/utils/apiErrorI18n';
import { UserProfileGrid } from './userDetail.shared';
import {
  adjustAdminUserBalance,
  banUser,
  fetchAdminUserDetail,
  resetAdminUserPassword,
  unlockAdminUser,
  type AdminBalanceCurrency,
  type AdminUserDetail,
  type AdminUserMetrics,
} from '../../lib/admin.api';

/**
 * "View user" side panel — item 79 (PROGRESSO.txt). Opened from anywhere in the admin panel
 * that references a `userId` without wanting to navigate away (first use: Financeiro's
 * withdrawal queue, so an admin reviewing a payout can check the requester's profile — hashrate,
 * IP intelligence, deposit/withdrawal history — without losing their place in the queue).
 *
 * Reuses `UserProfileGrid` (userDetail.shared.tsx, extracted from AdminUserDetailPage.tsx in
 * this same change) so the same profile card renders identically here and on the full detail
 * page — one source of truth for "what a user's profile looks like" in the admin panel.
 *
 * Deliberately profile-only (no balances/machines/activity/tickets/related tabs) — those stay
 * on the full page (linked at the bottom) since loading all of them here would defeat the
 * point of a lightweight, don't-lose-your-place side panel.
 */
export default function UserInfoDrawer({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [metrics, setMetrics] = useState<AdminUserMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await fetchAdminUserDetail(userId);
      if (result.data.ok && result.data.user) {
        setUser(result.data.user);
        setMetrics(result.data.metrics ?? null);
      } else {
        toast.error(result.data.message || t('adminUsers.load_error'));
      }
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, t('adminUsers.load_error')));
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => {
    setUser(null);
    setMetrics(null);
    void load();
  }, [load]);

  // Esc closes, matches the click-outside-to-close convention already used by admin modals.
  useEffect(() => {
    if (!userId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [userId, onClose]);

  const perform = async (fn: () => Promise<{ data: { ok: boolean; message?: string } }>) => {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.data.ok) toast.error(result.data.message || t('adminUsers.action_error'));
      else {
        toast.success(result.data.message || t('adminUsers.action_success'));
        await load();
      }
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, t('adminUsers.action_error')));
    } finally {
      setBusy(false);
    }
  };

  const adjustBalance = () => {
    if (!user) return;
    const currency = prompt(t('adminUsers.detail_balance_currency'), 'pol') as AdminBalanceCurrency | null;
    if (!currency) return;
    const amount = Number(prompt(t('adminUsers.detail_balance_amount'), '0'));
    if (!Number.isFinite(amount)) { toast.error(t('adminUsers.balance_invalid_amount')); return; }
    const reason = prompt(t('adminUsers.detail_balance_reason')) ?? undefined;
    void perform(() => adjustAdminUserBalance(user.id, { currency, amount, mode: 'add', reason }));
  };

  const resetPassword = () => {
    if (!user) return;
    const password = prompt(t('adminUsers.detail_password_prompt'));
    if (!password) return;
    void perform(() => resetAdminUserPassword(user.id, password));
  };

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden bg-slate-950 bg-[radial-gradient(circle_at_top,theme(colors.slate.900),theme(colors.slate.950)_60%)] shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/60 px-6 py-4 backdrop-blur">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-white">
              {user ? (user.username || user.name) : t('adminUsers.detail_loading')} {user ? <span className="font-mono text-amber-300">#{user.id}</span> : null}
            </h3>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label={t('adminManaged.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading || !user ? (
            <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-amber-400" /></div>
          ) : (
            <UserProfileGrid user={user} metrics={metrics} />
          )}
        </div>

        {user ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 bg-slate-900/60 px-6 py-4 backdrop-blur">
            <DrawerAction icon={user.isBanned ? <ShieldOff className="h-4 w-4" /> : <Ban className="h-4 w-4" />} disabled={busy} onClick={() => {
              if (confirm(user.isBanned ? t('adminUsers.confirm_unban', { id: user.id }) : t('adminUsers.confirm_ban', { id: user.id }))) void perform(() => banUser(user.id, user.isBanned));
            }}>
              {user.isBanned ? t('adminUsers.action_unban') : t('adminUsers.action_ban')}
            </DrawerAction>
            <DrawerAction icon={<Wallet className="h-4 w-4" />} disabled={busy} onClick={adjustBalance}>{t('adminUsers.action_balance')}</DrawerAction>
            <DrawerAction icon={<Unlock className="h-4 w-4" />} disabled={busy} onClick={() => void perform(() => unlockAdminUser(user.id))}>{t('adminUsers.action_unlock')}</DrawerAction>
            <DrawerAction icon={<KeyRound className="h-4 w-4" />} disabled={busy} onClick={resetPassword}>{t('adminUsers.action_reset_password')}</DrawerAction>
            <Link
              to={`/admin/users/${user.id}`}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-amber-500/30 px-3 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/10"
            >
              {t('adminUsers.detail_open_full')}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DrawerAction({ icon, children, disabled, onClick }: { icon: React.ReactNode; children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-40"
    >
      {icon}{children}
    </button>
  );
}
