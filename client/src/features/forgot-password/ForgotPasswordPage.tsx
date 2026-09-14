import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import AuthShell from '../../shared/components/AuthShell';
import { useForgotPasswordForm } from './lib/useForgotPasswordForm';
import TurnstileField from '../../shared/components/auth/TurnstileField';
import { resolveTurnstileSiteKeyForgot } from '../../shared/constants/turnstilePublic';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const {
    email,
    setEmail,
    isSubmitting,
    done,
    resetToken,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    handleSubmit,
    handleResetPassword,
    setTurnstileToken,
    turnstileRef,
  } = useForgotPasswordForm();

  return (
    <AuthShell hideAuthCta="forgot">
      <div className="mx-auto w-full max-w-md space-y-6">
        <h1 className="text-center text-2xl font-black text-white">{t('auth.forgot.title')}</h1>
        {error ? (
          <p className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}
        {resetToken ? (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('auth.forgot.new_password')}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.forgot.confirm_password')}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-white"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('auth.forgot.reset_submit')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.forgot.email_placeholder')}
                className="w-full rounded-xl border border-white/10 bg-slate-950/60 py-3 pl-10 pr-4 text-white"
                required
              />
            </div>
            <TurnstileField
              ref={turnstileRef}
              siteKey={resolveTurnstileSiteKeyForgot()}
              onToken={setTurnstileToken}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-white"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('auth.forgot.submit')}
            </button>
          </form>
        )}
        {done ? <p className="text-center text-sm text-gray-400">{t('auth.forgot.email_sent')}</p> : null}
        <p className="text-center text-sm">
          <Link to="/login" className="text-primary hover:underline">
            {t('auth.forgot.back_login')}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
