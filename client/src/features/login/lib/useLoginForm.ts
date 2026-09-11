import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuthStore, api } from '../../../shared/auth/auth.store';
import { requestPartnerStorageAccess } from '../../../shared/auth/csrfMemory';
import { postAuthLogin } from './login.api';
import { responseRequiresTwoFactorStep } from './login.twoFactorUi';
import { isAxiosTimeoutError } from '../../../shared/utils/apiTimeout';
import { readAuthErrorMessage } from '../../../shared/auth/auth.errors';
import { resolveApiErrorMessage } from '../../../shared/utils/apiErrorI18n';
import {
  clampLoginIdentifier,
  clampLoginPassword,
  normalizeTwoFactorInput,
  validateLoginIdentifierForSubmit,
  validateLoginPasswordForSubmit,
  validateTwoFactorForSubmit,
  validateLegacyNewPassword,
  safeInlineMessage,
  LOGIN_PASSWORD_MAX_LEN,
} from '../../../shared/utils/authInputGuards';
import type { TurnstileFieldHandle } from '../../../shared/components/auth/TurnstileField';
import { userscriptManagerKickEnabled } from '../../antibot/integrity/integrity.policy';

function isAxiosLikeError(err: unknown): err is { response?: { data?: Record<string, unknown> } } {
  return typeof err === 'object' && err !== null && 'response' in err;
}

/** All state, validation and submit handlers for LoginPage — kept out of the component so it stays JSX-only. */
export function useLoginForm() {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [localError, setLocalError] = useState('');
  const [showLegacyReset, setShowLegacyReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState('');
  const [twoFactorMethod, setTwoFactorMethod] = useState<'email' | 'other'>('email');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // item 89: token do Turnstile. Fica '' enquanto a feature estiver desligada (sem site
  // key o widget nem renderiza) — e o backend, sem secret, nem olha esse campo.
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileFieldHandle | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { error, isLoading, isAuthenticated } = useAuthStore();

  const userscriptBlockedMsg = t('errors.security.USERSCRIPT_MANAGER_BLOCKED');

  function liveUserscriptManagerSignal(): boolean {
    if (!userscriptManagerKickEnabled()) return false;
    try {
      const w = window as Window & {
        __BM_TM_TEST__?: unknown;
        Tampermonkey?: unknown;
        Violentmonkey?: unknown;
        '**VMInitInjection**'?: unknown;
        GM_info?: unknown;
        GM_xmlhttpRequest?: unknown;
        GM?: { info?: unknown };
      };
      // Align with site-integrity / login-reason-banner: MV3 often hides
      // window.Tampermonkey but still exposes GM_* / VM injection markers.
      return Boolean(
        w.__BM_TM_TEST__ ||
          w.Tampermonkey ||
          w.Violentmonkey ||
          w['**VMInitInjection**'] != null ||
          w.GM_info ||
          w.GM_xmlhttpRequest ||
          w.GM?.info,
      );
    } catch {
      return false;
    }
  }

  function hasUserscriptKickReason(): boolean {
    if (!userscriptManagerKickEnabled()) return false;
    try {
      if (sessionStorage.getItem('bm_logout_reason') === 'userscript_manager') return true;
      if (new URLSearchParams(location.search).get('reason') === 'userscript_manager') return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function ensureUserscriptReasonInUrl(): void {
    try {
      if (new URLSearchParams(location.search).get('reason') === 'userscript_manager') return;
      const u = new URL(window.location.href);
      u.searchParams.set('reason', 'userscript_manager');
      window.history.replaceState(null, '', `${u.pathname}${u.search}${u.hash}`);
    } catch {
      /* ignore */
    }
  }

  function clearUserscriptLogoutSticky(): void {
    try {
      sessionStorage.removeItem('bm_logout_reason');
      sessionStorage.removeItem('bm_logout_message');
    } catch {
      /* ignore */
    }
    // Do not rewrite ?reason= here — fighting integrity replaceState caused login reload loops.
  }

  // Do NOT bounce back to dashboard while TM/VM is still live — or while a kick sticky reason remains.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (liveUserscriptManagerSignal()) return;
    if (hasUserscriptKickReason()) return;
    navigate('/dashboard');
  }, [isAuthenticated, navigate, location.search]);

  useEffect(() => {
    void requestPartnerStorageAccess();
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      const googleErr = params.get('google_error')?.trim();
      const satspayErr = params.get('satspay_error')?.trim();
      const code = googleErr || satspayErr;
      if (!code) return;
      const key = googleErr
        ? `auth.login.errors.google_oauth_${code}`
        : `auth.login.errors.satspay_oauth_${code}`;
      const msg = t(key, {
        defaultValue: googleErr
          ? t('auth.login.errors.google_failed')
          : t('auth.login.errors.satspay_failed', { defaultValue: 'Login SatsPay falhou.' }),
      });
      setLocalError(safeInlineMessage(String(msg)));
      params.delete('google_error');
      params.delete('satspay_error');
      const qs = params.toString();
      navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true });
    } catch {
      /* ignore */
    }
  }, [location.pathname, location.search, navigate, t]);

  // Red card: live manager markers OR post-kick sticky/?reason= (MV3 often has no window.Tampermonkey).
  // Never clear sticky while ?reason=userscript_manager is present — that was wiping the alert after kick.
  useEffect(() => {
    let cancelled = false;
    let loggedOutOnce = false;
    const blockedMsg = userscriptBlockedMsg;

    const sync = () => {
      if (cancelled) return;
      const live = liveUserscriptManagerSignal();
      const kicked = hasUserscriptKickReason();
      if (live || kicked) {
        setLocalError((prev) => (prev === blockedMsg ? prev : blockedMsg));
        try {
          sessionStorage.setItem('bm_logout_reason', 'userscript_manager');
          sessionStorage.removeItem('bm_logout_message');
        } catch {
          /* ignore */
        }
        ensureUserscriptReasonInUrl();
        if (live && !loggedOutOnce) {
          loggedOutOnce = true;
          void useAuthStore.getState().logout().catch(() => {
            useAuthStore.setState({ user: null, isAuthenticated: false });
          });
        }
        return;
      }
      clearUserscriptLogoutSticky();
      setLocalError((prev) => (prev === blockedMsg ? '' : prev));
    };

    sync();
    const id = window.setInterval(sync, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userscriptBlockedMsg, location.pathname, location.search, navigate]);

  const setIdentifierClamped = (raw: string) => setIdentifier(clampLoginIdentifier(raw));
  const setPasswordClamped = (raw: string) => setPassword(clampLoginPassword(raw));
  const setNewPasswordClamped = (raw: string) => setNewPassword(clampLoginPassword(raw));
  const setConfirmPasswordClamped = (raw: string) => setConfirmPassword(clampLoginPassword(raw));
  const setTwoFactorTokenNormalized = (raw: string) => setTwoFactorToken(normalizeTwoFactorInput(raw));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (liveUserscriptManagerSignal()) {
      setLocalError(userscriptBlockedMsg);
      return;
    }

    if (requires2FA) {
      const tf = normalizeTwoFactorInput(twoFactorToken);
      const tfErr = validateTwoFactorForSubmit(tf);
      if (tfErr === 'incomplete') return setLocalError(t('auth.login.validation.two_factor_incomplete'));
      if (tfErr === 'invalid') return setLocalError(t('auth.login.validation.two_factor_invalid'));
    } else {
      const id = clampLoginIdentifier(identifier);
      const pw = clampLoginPassword(password);
      const idErr = validateLoginIdentifierForSubmit(id);
      if (idErr === 'empty') return setLocalError(t('auth.login.validation.identifier_empty'));
      if (idErr === 'too_long') return setLocalError(t('auth.login.validation.identifier_too_long'));
      if (idErr === 'invalid_chars') return setLocalError(t('auth.login.validation.identifier_invalid_chars'));
      if (idErr === 'invalid_email') return setLocalError(t('auth.login.validation.identifier_invalid_email'));
      const pwErr = validateLoginPasswordForSubmit(pw);
      if (pwErr === 'empty') return setLocalError(t('auth.login.validation.password_empty'));
      if (pwErr === 'too_long') {
        return setLocalError(t('auth.login.validation.password_too_long', { max: LOGIN_PASSWORD_MAX_LEN }));
      }
    }

    setIsSubmitting(true);
    try {
      const res = await postAuthLogin({
        identifier: clampLoginIdentifier(identifier),
        password: clampLoginPassword(password),
        twoFactorToken: requires2FA ? normalizeTwoFactorInput(twoFactorToken) : undefined,
        twoFactorChallengeToken: requires2FA && twoFactorChallengeToken ? twoFactorChallengeToken : undefined,
        cfTurnstileToken: turnstileToken || undefined,
      });

      const data = res.data as {
        require2FA?: boolean;
        code?: string;
        twoFactorChallengeToken?: string;
        twoFactorMethod?: string;
        needsLegacyReset?: boolean;
        ok?: boolean;
      };

      if (responseRequiresTwoFactorStep(data)) {
        const ch = typeof data.twoFactorChallengeToken === 'string' ? data.twoFactorChallengeToken : '';
        setTwoFactorChallengeToken(ch);
        setTwoFactorMethod(data.twoFactorMethod === 'email' ? 'email' : 'other');
        setRequires2FA(true);
        setLocalError('');
        if (data.twoFactorMethod === 'email') toast.message(t('auth.login.two_factor_email_hint'));
        return;
      }

      if (data.needsLegacyReset) {
        setShowLegacyReset(true);
        return;
      }

      if (data.ok) {
        setTwoFactorChallengeToken('');
        setRequires2FA(false);
        setTwoFactorMethod('email');
        // Hydrate auth store from cookies before routing — avoids bouncing back to /login
        // when ProtectedLayout's session check races the Set-Cookie from this response.
        await useAuthStore.getState().checkSession({ silent: true });
        const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
        navigate(from && from !== '/login' ? from : '/dashboard');
      }
    } catch (err: unknown) {
      if (isAxiosTimeoutError(err)) {
        setLocalError(t('auth.login.errors.request_timeout'));
        return;
      }
      // login-reason-banner may reject fetch/XHR with a bare Error(name=USERSCRIPT_MANAGER_BLOCKED)
      if (
        err instanceof Error &&
        (err.name === 'USERSCRIPT_MANAGER_BLOCKED' || err.message === 'USERSCRIPT_MANAGER_BLOCKED')
      ) {
        setLocalError(userscriptBlockedMsg);
        try {
          sessionStorage.setItem('bm_logout_reason', 'userscript_manager');
        } catch {
          /* ignore */
        }
        ensureUserscriptReasonInUrl();
        return;
      }
      if (isAxiosLikeError(err)) {
        const body = err.response?.data as Record<string, unknown> | undefined;
        if (body && responseRequiresTwoFactorStep(body as { require2FA?: boolean; code?: string })) {
          const ch = typeof body.twoFactorChallengeToken === 'string' ? body.twoFactorChallengeToken : '';
          setTwoFactorChallengeToken(ch);
          setTwoFactorMethod(body.twoFactorMethod === 'email' ? 'email' : 'other');
          setRequires2FA(true);
          setLocalError('');
          if (body.twoFactorMethod === 'email') toast.message(t('auth.login.two_factor_email_hint'));
          return;
        }
        if (body?.needsLegacyReset) {
          setShowLegacyReset(true);
          return;
        }
        const fieldErrorRaw = Array.isArray(body?.errors)
          ? (body?.errors as { message?: string }[])[0]?.message
          : undefined;
        const fieldError = typeof fieldErrorRaw === 'string' ? safeInlineMessage(fieldErrorRaw) : '';
        const code = typeof body?.code === 'string' ? body.code : '';
        const errorByCode: Record<string, string> = {
          IDENTIFIER_NOT_FOUND: t('auth.login.errors.identifier_not_found'),
          INVALID_CREDENTIALS: t('auth.login.errors.invalid_credentials'),
          INVALID_2FA: t('auth.login.errors.invalid_2fa'),
          INVALID_TWO_FACTOR_CODE: t('auth.login.errors.invalid_2fa'),
          INTERNAL_ERROR: t('auth.login.errors.internal_error'),
          SERVICE_UNAVAILABLE: t('auth.login.errors.service_unavailable'),
          EMAIL_2FA_UNAVAILABLE: t('auth.login.errors.email_2fa_unavailable'),
          ACCOUNT_DISABLED: t('auth.login.errors.account_disabled'),
          ACCOUNT_LOCKED: t('errors.security.ACCOUNT_LOCKED'),
          VPN_PROXY_BLOCKED: t('errors.security.VPN_PROXY_BLOCKED'),
          USERSCRIPT_MANAGER_BLOCKED: t('errors.security.USERSCRIPT_MANAGER_BLOCKED'),
          RATE_LIMIT_EXCEEDED: t('errors.security.RATE_LIMIT_EXCEEDED'),
          USERNAME_NOT_SUPPORTED: t('auth.login.errors.username_not_supported'),
          INVALID_CSRF_TOKEN: t('errors.security.INVALID_CSRF_TOKEN'),
          CAPTCHA_REQUIRED: t('errors.security.CAPTCHA_REQUIRED'),
          CAPTCHA_FAILED: t('errors.security.CAPTCHA_FAILED'),
        };
        const fromApi = safeInlineMessage(resolveApiErrorMessage(err, ''));
        setLocalError(
          fieldError || errorByCode[code] || (fromApi.length > 0 ? fromApi : '') || t('auth.login.errors.login_failed'),
        );
      } else {
        setLocalError(readAuthErrorMessage(err, t('auth.login.errors.login_failed')));
      }
      // Token do Turnstile é single-use: após qualquer falha o widget precisa ser
      // resetado, senão a próxima tentativa reenvia um token já consumido e falha de novo.
      turnstileRef.current?.reset();
      setTurnstileToken('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLegacyReset = async (e: FormEvent) => {
    e.preventDefault();
    const np = clampLoginPassword(newPassword);
    const cp = clampLoginPassword(confirmPassword);
    if (np !== cp) return toast.error(t('auth.register.errors.password_mismatch'));
    const v = validateLegacyNewPassword(np);
    if (v === 'empty' || v === 'too_short') return toast.error(t('auth.register.errors.password_min'));
    if (v === 'too_long') return toast.error(t('auth.register.errors.password_max'));

    try {
      setIsResetting(true);
      const res = await api.post('/auth/legacy-password-reset', {
        identifier: clampLoginIdentifier(identifier),
        newPassword: np,
      });
      const data = res.data as { ok?: boolean; message?: string };
      if (data.ok) {
        toast.success(t('accountSettings.password_changed'));
        setShowLegacyReset(false);
        setPassword(np);
      }
    } catch (err: unknown) {
      toast.error(resolveApiErrorMessage(err, t('auth.login.errors.login_failed')));
    } finally {
      setIsResetting(false);
    }
  };

  const displayError = safeInlineMessage(localError || error || '', 500);

  return {
    identifier,
    setIdentifier: setIdentifierClamped,
    password,
    setPassword: setPasswordClamped,
    showPassword,
    setShowPassword,
    requires2FA,
    setRequires2FA,
    twoFactorToken,
    setTwoFactorToken: setTwoFactorTokenNormalized,
    showLegacyReset,
    setShowLegacyReset,
    newPassword,
    setNewPassword: setNewPasswordClamped,
    confirmPassword,
    setConfirmPassword: setConfirmPasswordClamped,
    isResetting,
    twoFactorChallengeToken,
    setTwoFactorChallengeToken,
    twoFactorMethod,
    setTwoFactorMethod,
    isSubmitting,
    isLoading,
    error,
    localError,
    setLocalError,
    displayError,
    handleSubmit,
    handleLegacyReset,
    setTurnstileToken,
    turnstileRef,
  };
}
