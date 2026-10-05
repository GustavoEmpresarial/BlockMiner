import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import {
    Settings as SettingsIcon,
    Lock,
    Wallet,
    User,
    ShieldCheck,
    Save,
    Loader2,
    CheckCircle2,
    Mail,
} from 'lucide-react';
import { api, useAuthStore } from '../../shared/auth/auth.store';
import { Edit2, Link2, Unlink } from 'lucide-react';
import { useGameStore } from '../shell/lib/game.store';
import { resolveApiErrorMessage, resolveApiPayloadMessage } from '../../shared/utils/apiErrorI18n';
import { useWalletLink } from '../wallet/lib/useWalletLink';
import IconBadge from '../../shared/components/IconBadge';
import SectionHeader from '../../shared/components/SectionHeader';

export default function Settings() {
    const { t } = useTranslation();
    const { user, setUser } = useAuthStore();
    const { fetchAll } = useGameStore();
    
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isChangingUsername, setIsChangingUsername] = useState(false);
    const [newUsername, setNewUsername] = useState('');

    const [email2faEnabled, setEmail2faEnabled] = useState(false);
    const [email2faLoading, setEmail2faLoading] = useState(false);
    const [email2faChallenge, setEmail2faChallenge] = useState<{
        challengeToken: string;
        ttlMinutes: number;
        action: 'enable' | 'disable';
    } | null>(null);
    const [email2faCode, setEmail2faCode] = useState('');

    const {
        savedWallet,
        isConnecting,
        isLinking,
        connectWallet,
        linkWallet,
        unlinkWallet,
    } = useWalletLink();
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    });

    useEffect(() => {
        api.get('/user/email-2fa/status')
            .then((res) => { if (res.data?.ok) setEmail2faEnabled(Boolean(res.data.enabled)); })
            .catch(() => {});
    }, []);

    const handleEmail2faToggle = async () => {
        if (email2faLoading) return;
        try {
            setEmail2faLoading(true);
            const res = await api.post('/user/email-2fa/challenge');
            if (res.data?.ok) {
                setEmail2faChallenge({
                    challengeToken: res.data.challengeToken,
                    ttlMinutes: res.data.ttlMinutes ?? 10,
                    action: email2faEnabled ? 'disable' : 'enable',
                });
                setEmail2faCode('');
                toast.info(t('accountSettings.code_sent_email'));
            }
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (err.response?.data as { message?: string })?.message ?? null
                : null;
            toast.error(resolveApiErrorMessage(err, t('common.error')));
        } finally {
            setEmail2faLoading(false);
        }
    };

    const handleEmail2faCodeSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!email2faChallenge || email2faLoading) return;
        if (!/^\d{6}$/.test(email2faCode.trim())) {
            toast.error(t('accountSettings.code_six_digits'));
            return;
        }
        try {
            setEmail2faLoading(true);
            const endpoint = email2faChallenge.action === 'enable' ? '/user/email-2fa/enable' : '/user/email-2fa/disable';
            const res = await api.post(endpoint, {
                code: email2faCode.trim(),
                challengeToken: email2faChallenge.challengeToken,
            });
            if (res.data?.ok) {
                setEmail2faEnabled(email2faChallenge.action === 'enable');
                setEmail2faChallenge(null);
                setEmail2faCode('');
                toast.success(resolveApiPayloadMessage(res.data, t('accountSettings.saved')));
            } else {
                toast.error(resolveApiPayloadMessage(res.data, t('common.error')));
            }
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (err.response?.data as { message?: string })?.message ?? null
                : null;
            if (msg?.toLowerCase().includes('expirado')) {
                setEmail2faChallenge(null);
                setEmail2faCode('');
            }
            toast.error(resolveApiErrorMessage(err, t('common.error')));
        } finally {
            setEmail2faLoading(false);
        }
    };

    const handleChangeUsername = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmed = newUsername.trim();
        if (!trimmed) return;
        if (trimmed.length < 3) return toast.error(t('accountSettings.username_min'));
        if (!/^[a-zA-Z0-9._\- ]+$/.test(trimmed)) return toast.error(t('accountSettings.username_chars'));
        try {
            setIsChangingUsername(true);
            const res = await api.post('/user/change-username', { username: trimmed });
            if (res.data.ok) {
                toast.success(t('accountSettings.username_changed'));
                setUser({ username: trimmed, name: trimmed });
                setNewUsername('');
            }
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (typeof err.response?.data === 'object' &&
                      err.response?.data !== null &&
                      'message' in err.response.data &&
                      typeof (err.response.data as { message?: unknown }).message === 'string'
                      ? (err.response.data as { message: string }).message
                      : null)
                : null;
            toast.error(resolveApiErrorMessage(err, t('common.error')));
        } finally {
            setIsChangingUsername(false);
        }
    };

    // Replaces the old plain-text "type an address, click save" form: that posted to
    // POST /wallet/address, a route that never existed on the backend (inherited straight from
    // legacy's own SettingsPage.tsx, which called the exact same nonexistent endpoint — not a
    // migration bug). The route that DOES exist for this (/wallet/update-address) requires a
    // signed ownership proof, which a bare text field can never provide anyway — a withdrawal
    // address with no proof of ownership is exactly the kind of thing that should require
    // signing, not just typing. Reuses the same connect+sign flow already shipped and working
    // on the Wallet page (useWalletLink → /wallet/link/challenge + /wallet/link/verify).
    const handleConnectAndLinkWallet = async () => {
        const connected = await connectWallet();
        if (!connected) return;
        const linked = await linkWallet();
        if (linked) void fetchAll();
    };

    const handleChangePassword = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            return toast.error(t('accountSettings.password_mismatch'));
        }
        if (passwords.new.length < 8) {
            return toast.error(t('accountSettings.password_min'));
        }

        try {
            setIsChangingPassword(true);
            const res = await api.post('/auth/change-password', {
                currentPassword: passwords.current,
                newPassword: passwords.new
            });
            if (res.data.ok) {
                toast.success(t('accountSettings.password_changed'));
                setPasswords({ current: '', new: '', confirm: '' });
            }
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (typeof err.response?.data === 'object' &&
                      err.response?.data !== null &&
                      'message' in err.response.data &&
                      typeof (err.response.data as { message?: unknown }).message === 'string'
                      ? (err.response.data as { message: string }).message
                      : null)
                : null;
            toast.error(resolveApiErrorMessage(err, t('common.error')));
        } finally {
            setIsChangingPassword(false);
        }
    };

    return (
        <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
                <div className="flex items-center gap-3">
                    <IconBadge icon={SettingsIcon} variant="primary" size="lg" />
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{t('accountSettings.title')}</h1>
                        <p className="text-slate-400 text-xs sm:text-sm font-medium">{t('accountSettings.subtitle')}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Account Info & Wallet */}
                <div className="space-y-8">
                    <div className="bg-slate-900/60 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-[4px_4px_0px_#000000] space-y-6">
                        <SectionHeader icon={User} iconVariant="sky" title={t('accountSettings.profile_title')} />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 shadow-[2px_2px_0px_#000000]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('accountSettings.username_label')}</span>
                                <span className="text-sm font-bold text-white font-mono">
                                    {String(
                                        (typeof user?.username === 'string' && user.username) ||
                                            (typeof user?.name === 'string' && user.name) ||
                                            '',
                                    )}
                                </span>
                            </div>
                            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 shadow-[2px_2px_0px_#000000]">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">{t('accountSettings.email_label')}</span>
                                <span className="text-sm font-bold text-white truncate font-mono block">
                                    {String(typeof user?.email === 'string' ? user.email : '')}
                                </span>
                            </div>
                        </div>

                        <form onSubmit={handleChangeUsername} className="space-y-3 pt-3 border-t border-slate-800">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{t('accountSettings.new_username_label')}</label>
                            <div className="relative flex items-center bg-slate-950 border-2 border-slate-700 rounded-xl p-1.5 focus-within:border-primary transition-all shadow-[2px_2px_0px_#000000]">
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    placeholder={String(
                                        (typeof user?.username === 'string' && user.username) ||
                                            (typeof user?.name === 'string' && user.name) ||
                                            '',
                                    )}
                                    minLength={3}
                                    maxLength={24}
                                    className="bg-transparent border-none text-sm font-bold text-white px-3 w-full focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={isChangingUsername || !newUsername.trim()}
                                    className="bg-blue-600 hover:bg-blue-700 active:translate-x-0.5 active:translate-y-0.5 text-white px-5 py-2.5 rounded-lg transition-all disabled:opacity-50 flex items-center gap-2 font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    {isChangingUsername ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Edit2 className="w-3.5 h-3.5" />}
                                    {t('common.save')}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium px-2">{t('accountSettings.username_hint')}</p>
                        </form>

                        <div className="space-y-4 pt-2">
                            <SectionHeader icon={Wallet} iconVariant="violet" title={t('accountSettings.wallet_title')} />

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('accountSettings.wallet_address_label')}</label>
                                {savedWallet.walletAddress ? (
                                    <div className="flex flex-col gap-3 bg-slate-950/80 border-2 border-slate-800 rounded-2xl p-4 shadow-[2px_2px_0px_#000000] sm:flex-row sm:items-center sm:justify-between">
                                        <span className="flex items-center gap-2 text-sm font-bold text-white font-mono break-all">
                                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                                            {savedWallet.walletAddress}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => void unlinkWallet()}
                                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-slate-700 bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-300 hover:border-red-500/40 hover:text-red-400 active:translate-x-0.5 active:translate-y-0.5 transition-all shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                        >
                                            <Unlink className="w-3.5 h-3.5" />
                                            {t('accountSettings.wallet_unlink')}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void handleConnectAndLinkWallet()}
                                        disabled={isConnecting || isLinking}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:translate-x-0.5 active:translate-y-0.5 px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition-all shadow-[2px_2px_0px_#000000] disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
                                    >
                                        {isConnecting || isLinking ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Link2 className="w-4 h-4" />
                                        )}
                                        {isConnecting || isLinking
                                            ? t('accountSettings.wallet_linking')
                                            : t('accountSettings.wallet_connect_cta')}
                                    </button>
                                )}
                                <p className="text-[10px] text-slate-500 font-medium px-2">{t('accountSettings.wallet_hint')}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-emerald-950/20 border-2 border-emerald-500/30 rounded-3xl p-6 flex items-start gap-4 shadow-[4px_4px_0px_#000000]">
                        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl shrink-0 shadow-[2px_2px_0px_#000000]">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h4 className="text-white font-black text-sm uppercase tracking-wide">{t('accountSettings.verified_title')}</h4>
                            <p className="text-xs text-slate-400 font-medium leading-relaxed mt-1">{t('accountSettings.verified_body')}</p>
                        </div>
                    </div>
                </div>
                {/* Password Change + Email 2FA */}
                <div className="space-y-8">
                    <div className="bg-slate-900/60 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-[4px_4px_0px_#000000] space-y-6">
                        <SectionHeader icon={Lock} iconVariant="amber" title={t('accountSettings.security_title')} />

                        <form onSubmit={handleChangePassword} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('accountSettings.current_password_label')}</label>
                                <input
                                    type="password"
                                    value={passwords.current}
                                    onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl py-3 px-4 text-sm font-bold text-white focus:outline-none focus:border-primary transition-all shadow-[2px_2px_0px_#000000]"
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('accountSettings.new_password_label')}</label>
                                <input
                                    type="password"
                                    value={passwords.new}
                                    onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl py-3 px-4 text-sm font-bold text-white focus:outline-none focus:border-primary transition-all shadow-[2px_2px_0px_#000000]"
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('accountSettings.confirm_password_label')}</label>
                                <input
                                    type="password"
                                    value={passwords.confirm}
                                    onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                                    className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl py-3 px-4 text-sm font-bold text-white focus:outline-none focus:border-primary transition-all shadow-[2px_2px_0px_#000000]"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isChangingPassword}
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:translate-x-0.5 active:translate-y-0.5 text-white rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                                {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                {t('accountSettings.update_credentials')}
                            </button>
                        </form>
                    </div>

                    {/* Email 2FA */}
                    <div className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 shadow-[4px_4px_0px_#000000] border-2 transition-all duration-300 ${
                        email2faEnabled
                            ? 'bg-emerald-950/20 border-emerald-500/30'
                            : 'bg-slate-900/60 border-slate-800'
                    }`}>
                        {/* Glow accent when active */}
                        {email2faEnabled && (
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
                        )}

                        {/* Header */}
                        <div className="relative flex items-center justify-between gap-4 mb-6">
                            <div className="flex items-center gap-3.5 min-w-0">
                                <div className={`relative p-3 rounded-xl border-2 transition-all duration-300 shrink-0 shadow-[2px_2px_0px_#000000] ${
                                    email2faEnabled ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500'
                                }`}>
                                    {email2faEnabled
                                        ? <ShieldCheck className="w-6 h-6 text-emerald-400" />
                                        : <Mail className="w-6 h-6 text-slate-400" />
                                    }
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base font-black text-white uppercase tracking-wider truncate">
                                        {t('accountSettings.email_2fa_title')}
                                    </h2>
                                    <p className={`text-xs font-bold mt-0.5 ${
                                        email2faEnabled ? 'text-emerald-400' : 'text-slate-400'
                                    }`}>
                                        {email2faEnabled
                                            ? t('accountSettings.email_2fa_active')
                                            : t('accountSettings.email_2fa_inactive')}
                                    </p>
                                </div>
                            </div>

                            {/* Toggle pill */}
                            <button
                                type="button"
                                onClick={handleEmail2faToggle}
                                disabled={email2faLoading || Boolean(email2faChallenge)}
                                aria-label={
                                    email2faEnabled
                                        ? t('accountSettings.email_2fa_disable_aria')
                                        : t('accountSettings.email_2fa_enable_aria')
                                }
                                className={`relative shrink-0 w-12 h-6 rounded-full border-2 transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50 ${
                                    email2faEnabled ? 'bg-emerald-500 border-emerald-400' : 'bg-slate-800 border-slate-700'
                                }`}
                            >
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-[1px_1px_0px_#000000] transition-all duration-300 ${
                                    email2faEnabled ? 'left-[calc(100%-1.25rem)]' : 'left-0.5'
                                }`} />
                                {email2faLoading && (
                                    <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 animate-spin text-white" />
                                )}
                            </button>
                        </div>

                        {/* What this protects */}
                        <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5 text-[10px] font-bold uppercase tracking-wider">
                            {[
                                { label: t('accountSettings.email_2fa_protect_login'), active: email2faEnabled },
                                { label: t('accountSettings.email_2fa_protect_withdrawals'), active: email2faEnabled },
                            ].map(({ label, active }) => (
                                <div key={label} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all duration-300 shadow-[1px_1px_0px_#000000] ${
                                    active
                                        ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                                        : 'bg-slate-950/60 border-slate-800 text-slate-500'
                                }`}>
                                    <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-400' : 'text-slate-600'}`} />
                                    <span>{label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Code verification form (shown after toggle click) */}
                        {email2faChallenge && (
                            <form onSubmit={handleEmail2faCodeSubmit} className="relative space-y-4 pt-5 border-t-2 border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <p className="text-xs text-slate-300 text-center leading-relaxed font-medium">
                                    {t('accountSettings.email_2fa_code_hint')}<br />
                                    <span className="text-slate-500">
                                        {t('accountSettings.email_2fa_expires', { minutes: email2faChallenge.ttlMinutes })}
                                    </span>
                                </p>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]{6}"
                                    maxLength={6}
                                    value={email2faCode}
                                    onChange={(e) => setEmail2faCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="• • • • • •"
                                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-primary rounded-xl py-3.5 px-6 text-2xl font-black text-white text-center tracking-[0.5em] focus:outline-none transition-all shadow-[2px_2px_0px_#000000] placeholder:tracking-[0.3em] placeholder:text-slate-700 font-mono"
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={email2faLoading || email2faCode.length !== 6}
                                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:translate-x-0.5 active:translate-y-0.5 text-white rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    {email2faLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    {t('accountSettings.email_2fa_confirm')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setEmail2faChallenge(null); setEmail2faCode(''); }}
                                    className="w-full py-2 text-slate-400 hover:text-white text-xs font-black uppercase tracking-wider transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    {t('common.cancel')}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
