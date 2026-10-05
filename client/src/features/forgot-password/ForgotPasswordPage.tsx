import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Loader2, ChevronRight, AlertCircle, KeyRound } from 'lucide-react';
import AuthShell from '../../shared/components/AuthShell';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import { useForgotPasswordForm } from './lib/useForgotPasswordForm';

const FIELD_CLASS =
  'w-full border-2 border-slate-700 bg-slate-950 rounded-xl px-4 py-3 text-sm text-white shadow-[2px_2px_0px_#000000] focus:border-sky-400 focus:outline-none';
const CTA_CLASS =
  'flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3 font-black uppercase tracking-widest text-slate-950 shadow-[2px_2px_0px_#000000] hover:bg-sky-400 active:translate-x-0.5 active:translate-y-0.5 disabled:bg-slate-800 disabled:text-slate-300 disabled:shadow-none';

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
  } = useForgotPasswordForm();

  return (
    <AuthShell hideAuthCta="forgot">
      <Card spacing="md" className="mx-auto w-full max-w-md">
        <div className="flex items-center gap-4 pb-3 border-b-2 border-slate-800">
          <IconBadge icon={KeyRound} variant="sky" size="lg" />
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">{t('auth.forgot.title')}</h1>
        </div>
        {error ? (
          <p className="flex items-center gap-2 text-sm font-bold text-red-300">
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
              className={FIELD_CLASS}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('auth.forgot.confirm_password')}
              className={FIELD_CLASS}
            />
            <button type="submit" disabled={isSubmitting} className={CTA_CLASS}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('auth.forgot.reset_submit')}
              <ChevronRight className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.forgot.email_placeholder')}
                className="w-full border-2 border-slate-700 bg-slate-950 rounded-xl py-3 pl-10 pr-4 text-sm text-white shadow-[2px_2px_0px_#000000] focus:border-sky-400 focus:outline-none"
                required
              />
            </div>
            <button type="submit" disabled={isSubmitting} className={CTA_CLASS}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('auth.forgot.submit')}
            </button>
          </form>
        )}
        {done ? <p className="text-center text-sm font-medium text-slate-300">{t('auth.forgot.email_sent')}</p> : null}
        <p className="text-center text-sm">
          <Link to="/login" className="font-black uppercase tracking-widest text-sky-400 hover:text-sky-300">
            {t('auth.forgot.back_login')}
          </Link>
        </p>
      </Card>
    </AuthShell>
  );
}
