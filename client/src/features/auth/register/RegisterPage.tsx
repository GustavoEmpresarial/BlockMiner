import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, User, AlertCircle, Loader2, ChevronRight, Eye, EyeOff, Gift } from 'lucide-react';
import Card from '../../../shared/components/Card';
import AuthShell from '../../../shared/components/AuthShell';
import { useRegisterForm } from './lib/useRegisterForm';
import {
  REGISTER_USERNAME_MIN,
  REGISTER_USERNAME_MAX,
  REGISTER_EMAIL_MAX_LEN,
  REGISTER_PASSWORD_MIN_LEN,
  REGISTER_PASSWORD_MAX_LEN,
  REGISTER_REF_CODE_MAX_LEN,
} from '../../../shared/utils/registerFieldLimits';
import { safeInlineMessage } from '../../../shared/utils/registerInputGuards';
import TurnstileField from '../../../shared/components/auth/TurnstileField';
import { resolveTurnstileSiteKeyRegister } from '../../../shared/constants/turnstilePublic';
import { GoogleSignInButton } from '../GoogleSignInButton';
import { SatspaySignInButton } from '../SatspaySignInButton';

const regFieldClass =
  'block w-full pl-12 pr-4 py-3.5 border-2 border-slate-700 rounded-xl bg-slate-950 text-white placeholder-slate-600 focus:outline-none focus:border-primary shadow-[2px_2px_0px_#000000] transition-all font-medium text-sm';

// See useRegisterForm.ts for deviations from legacy/client RegisterPage.tsx
// (no SocialLoginButtons, no UTM capture). O widget do Turnstile foi portado no item 89
// e renderiza só quando VITE_TURNSTILE_SITE_KEY* está configurada.
export default function RegisterPage() {
  const { t } = useTranslation();
  const [oauthError, setOauthError] = useState<string | null>(null);
  const {
    searchParams,
    formData,
    showPassword,
    setShowPassword,
    fieldErrors,
    termsCheckboxRef,
    isLoading,
    error,
    displayStoreError,
    handleChange,
    handleSubmit,
    setTurnstileToken,
    turnstileRef,
  } = useRegisterForm();

  const alertMessage = oauthError || (error ? displayStoreError : null);

  return (
    <AuthShell hideAuthCta="register">
      <div className="w-full max-w-[440px] sm:max-w-[480px] relative z-10">
        <div className="text-center mb-6 sm:mb-9 px-1">
          <h1 className="font-black leading-[1.08] text-[clamp(1.55rem,5.5vw,2.5rem)]">
            <span className="block text-white">{t('auth.register.title')}</span>
            <span className="block bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
              {t('auth.register.subtitle')}
            </span>
          </h1>
        </div>

        <Card className="p-5 sm:p-8 space-y-5 shadow-[4px_4px_0px_#000000]">
          {alertMessage && (
            <div
              className="mb-5 sm:mb-6 p-4 bg-red-950/20 border-2 border-red-500/30 rounded-2xl flex items-start gap-3 shadow-[2px_2px_0px_#000000]"
              role="alert"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs font-bold leading-relaxed break-words">{safeInlineMessage(alertMessage)}</p>
            </div>
          )}

          {formData.refCode && (
            <div className="mb-5 sm:mb-6 p-3 bg-primary/10 border-2 border-primary/30 rounded-2xl flex items-center gap-3 shadow-[1px_1px_0px_#000000]">
              <Gift className="w-4 h-4 text-primary shrink-0" />
              <p className="text-primary text-[11px] font-black uppercase tracking-wider">
                {t('auth.register.referral_msg', {
                  code: safeInlineMessage(formData.refCode, REGISTER_REF_CODE_MAX_LEN),
                })}
              </p>
            </div>
          )}

          <form data-testid="register-main-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="username">
                {t('auth.register.username_label')}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  minLength={REGISTER_USERNAME_MIN}
                  maxLength={REGISTER_USERNAME_MAX}
                  autoComplete="username"
                  value={formData.username}
                  onChange={handleChange}
                  className={regFieldClass}
                  placeholder={t('auth.register.username_placeholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="email">
                {t('auth.register.email_label')}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  maxLength={REGISTER_EMAIL_MAX_LEN}
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={regFieldClass}
                  placeholder={t('auth.register.email_placeholder')}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label
                  className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1"
                  htmlFor="password"
                >
                  {t('auth.register.password_label')}
                </label>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={REGISTER_PASSWORD_MIN_LEN}
                  maxLength={REGISTER_PASSWORD_MAX_LEN}
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={handleChange}
                  className="block w-full px-4 py-3.5 border-2 border-slate-700 rounded-xl bg-slate-950 text-white placeholder-slate-600 focus:outline-none focus:border-primary shadow-[2px_2px_0px_#000000] transition-all font-medium text-sm"
                  placeholder={t('auth.register.password_placeholder')}
                />
              </div>
              <div className="space-y-2">
                <label
                  className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1"
                  htmlFor="confirmPassword"
                >
                  {t('auth.register.confirm_password_label')}
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={REGISTER_PASSWORD_MIN_LEN}
                  maxLength={REGISTER_PASSWORD_MAX_LEN}
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="block w-full px-4 py-3.5 border-2 border-slate-700 rounded-xl bg-slate-950 text-white placeholder-slate-600 focus:outline-none focus:border-primary shadow-[2px_2px_0px_#000000] transition-all font-medium text-sm"
                  placeholder={t('auth.register.confirm_password_placeholder')}
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-primary transition-colors uppercase tracking-widest"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showPassword ? t('auth.register.hide_password') : t('auth.register.show_password')}
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1" htmlFor="refCode">
                {t('auth.register.referral_label')}
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Gift className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                </div>
                <input
                  id="refCode"
                  name="refCode"
                  type="text"
                  maxLength={REGISTER_REF_CODE_MAX_LEN}
                  value={formData.refCode}
                  onChange={handleChange}
                  readOnly={Boolean(searchParams.get('ref'))}
                  className={`block w-full pl-12 pr-4 py-3.5 border-2 border-slate-700 rounded-xl bg-slate-950 text-white placeholder-slate-600 focus:outline-none focus:border-primary shadow-[2px_2px_0px_#000000] transition-all font-medium text-sm ${searchParams.get('ref') ? 'opacity-70 cursor-default' : ''}`}
                  placeholder={t('auth.register.referral_placeholder')}
                />
              </div>
            </div>

            <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-4 shadow-[1px_1px_0px_#000000]">
              <div className="flex items-start gap-3">
                <input
                  ref={termsCheckboxRef}
                  id="acceptTerms"
                  name="acceptTerms"
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={handleChange}
                  className="mt-1 h-4 w-4 rounded border-2 border-slate-700 bg-slate-950 text-primary focus:ring-2 focus:ring-primary/40"
                  aria-invalid={fieldErrors.acceptTerms ? 'true' : 'false'}
                  aria-describedby={fieldErrors.acceptTerms ? 'acceptTerms-error' : 'acceptTerms-hint'}
                />
                <div className="space-y-2">
                  <label htmlFor="acceptTerms" className="text-sm font-medium leading-6 text-slate-200">
                    {t('auth.register.termsConsent.prefix')}{' '}
                    <span className="font-bold text-sky-400 underline underline-offset-4">
                      {t('auth.register.termsConsent.linkLabel')}
                    </span>
                    .
                  </label>
                  <p id="acceptTerms-hint" className="text-xs leading-5 text-slate-400 font-medium">
                    {t('auth.register.termsConsent.helpText')}
                  </p>
                  {fieldErrors.acceptTerms && (
                    <p id="acceptTerms-error" role="alert" className="text-xs font-semibold text-red-400">
                      {fieldErrors.acceptTerms}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* item 89: só renderiza se VITE_TURNSTILE_SITE_KEY* estiver configurada. */}
            <TurnstileField
              ref={turnstileRef}
              siteKey={resolveTurnstileSiteKeyRegister()}
              onToken={setTurnstileToken}
            />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-sky-500 hover:bg-sky-400 active:translate-x-0.5 active:translate-y-0.5 text-slate-950 rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-[2px_2px_0px_#000000] disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-sky-400 group"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-slate-950" />
              ) : (
                <>
                  {t('auth.register.submit')}
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-5 sm:mt-6 space-y-3">
            <div className="relative flex items-center gap-3" aria-hidden>
              <div className="h-px flex-1 bg-slate-800" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">
                {t('auth.login.google_or', { defaultValue: 'ou' })}
              </span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>
            <GoogleSignInButton onError={setOauthError} />
            <SatspaySignInButton onError={setOauthError} />
          </div>

          <div className="mt-4 text-center">
            <p className="text-slate-400 text-xs font-medium">
              {t('auth.register.already_have_account')}{' '}
              <Link
                to="/login"
                className="text-primary hover:text-white font-black transition-colors ml-1 uppercase tracking-widest"
              >
                {t('auth.register.login_now')}
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </AuthShell>
  );
}
