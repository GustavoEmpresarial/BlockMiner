import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, AlertCircle, Loader2, ChevronRight, Eye, EyeOff } from 'lucide-react';
import AuthShell from '../../shared/components/AuthShell';
import { useLoginForm } from './lib/useLoginForm';
import { safeInlineMessage, LOGIN_PASSWORD_MAX_LEN } from '../../shared/utils/authInputGuards';
import TurnstileField from '../../shared/components/auth/TurnstileField';
import { resolveTurnstileSiteKeyLogin } from '../../shared/constants/turnstilePublic';
import { SatspaySignInButton } from './SatspaySignInButton';
import { GoogleSignInButton } from './GoogleSignInButton';

const fieldClass =
  'w-full bg-slate-950/60 border border-white/10 rounded-xl sm:rounded-2xl py-3 sm:py-3.5 pl-11 sm:pl-12 pr-4 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500/30';

export default function LoginPage() {
  const { t } = useTranslation();
  const {
    identifier,
    setIdentifier,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    requires2FA,
    twoFactorToken,
    setTwoFactorToken,
    localError,
    setLocalError,
    isSubmitting,
    handleSubmit,
    setTurnstileToken,
    turnstileRef,
    twoFactorMethod,
  } = useLoginForm();

  return (
    <AuthShell hideAuthCta="login">
      <div className="w-full max-w-[440px] sm:max-w-[480px] relative z-10">
        <div className="text-center mb-6 sm:mb-9 px-1">
          <h1 className="font-black leading-[1.08] text-[clamp(1.55rem,5.5vw,2.5rem)]">
            <span className="block text-white">{t('auth.login.title')}</span>
            <span className="block bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
              {t('auth.login.subtitle')}
            </span>
          </h1>
        </div>

        <div className="bg-slate-900/75 border border-white/10 backdrop-blur-xl rounded-2xl sm:rounded-[1.75rem] p-5 sm:p-8 shadow-2xl shadow-black/40">
          {localError && (
            <div
              className="mb-5 sm:mb-6 p-3.5 sm:p-4 bg-red-500/10 border border-red-500/20 rounded-xl sm:rounded-2xl flex items-start gap-3"
              role="alert"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs font-bold leading-relaxed break-words">{safeInlineMessage(localError)}</p>
            </div>
          )}

          <form data-testid="login-main-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-0.5" htmlFor="identifier">
                {t('auth.login.email_label')}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600 group-focus-within:text-sky-400 transition-colors" />
                </div>
                <input
                  id="identifier"
                  name="identifier"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className={fieldClass}
                  placeholder={t('auth.login.identifier_placeholder')}
                />
              </div>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between gap-2 ml-0.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest" htmlFor="password">
                  {t('auth.login.password_label')}
                </label>
                <Link to="/forgot-password" className="text-[10px] font-bold text-sky-400 hover:text-sky-300 shrink-0">
                  {t('auth.login.forgot_password')}
                </Link>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 sm:pl-4 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600 group-focus-within:text-sky-400 transition-colors" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  maxLength={LOGIN_PASSWORD_MAX_LEN}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${fieldClass} pr-11 sm:pr-12`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3.5 sm:pr-4 flex items-center text-gray-500 hover:text-white"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {requires2FA && (
              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-0.5" htmlFor="otp">
                  {twoFactorMethod === 'email'
                    ? t('auth.login.two_factor_email_label', { defaultValue: 'Código do e-mail' })
                    : t('auth.login.two_factor_label', { defaultValue: 'Código 2FA' })}
                </label>
                <input
                  id="otp"
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl sm:rounded-2xl py-3 sm:py-3.5 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>
            )}

            <div className="overflow-x-auto max-w-full [-webkit-overflow-scrolling:touch]">
              <TurnstileField
                ref={turnstileRef}
                siteKey={resolveTurnstileSiteKeyLogin()}
                onToken={setTurnstileToken}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-400 py-3.5 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/20 disabled:opacity-60 active:scale-[0.99] transition-transform"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {t('auth.login.submit')}
              {!isSubmitting ? <ChevronRight className="h-4 w-4" /> : null}
            </button>
          </form>

          <div className="mt-5 sm:mt-6 space-y-3">
            <div className="relative flex items-center gap-3" aria-hidden>
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                {t('auth.login.google_or', { defaultValue: 'ou' })}
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <GoogleSignInButton onError={setLocalError} />
            <SatspaySignInButton onError={setLocalError} />
          </div>

          <p className="mt-6 sm:mt-8 text-center text-xs text-gray-500 leading-relaxed">
            {t('auth.login.no_account')}{' '}
            <Link to="/register" className="font-bold text-sky-400 hover:text-sky-300">
              {t('auth.login.register_now')}
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
