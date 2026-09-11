import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../../shared/auth/auth.store';
import {
  REGISTER_USERNAME_MIN,
  REGISTER_USERNAME_MAX,
  REGISTER_EMAIL_MAX_LEN,
  REGISTER_PASSWORD_MIN_LEN,
  REGISTER_PASSWORD_MAX_LEN,
  REGISTER_REF_CODE_MAX_LEN,
} from '../../../shared/utils/registerFieldLimits';
import { isRegisterAllowedEmailDomain } from '../../../shared/utils/registerAllowedEmailDomains';
import {
  clipRefCodeFromQuery,
  sanitizeRegisterUsername,
  sanitizeRegisterEmail,
  sanitizeRegisterPassword,
  sanitizeRegisterRefCode,
  validateUsernameShape,
  validateEmailShape,
  safeInlineMessage,
} from '../../../shared/utils/registerInputGuards';
import type { TurnstileFieldHandle } from '../../../shared/components/auth/TurnstileField';

const FIELD_MAX_LEN: Record<string, number> = {
  username: REGISTER_USERNAME_MAX,
  email: REGISTER_EMAIL_MAX_LEN,
  password: REGISTER_PASSWORD_MAX_LEN,
  confirmPassword: REGISTER_PASSWORD_MAX_LEN,
  refCode: REGISTER_REF_CODE_MAX_LEN,
};

type RegisterFormState = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  refCode: string;
  acceptTerms: boolean;
};

/** All state, validation and submit handlers for RegisterPage — kept out of the component so it stays JSX-only. */
export function useRegisterForm() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState<RegisterFormState>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    refCode: clipRefCodeFromQuery(searchParams.get('ref')),
    acceptTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const termsCheckboxRef = useRef<HTMLInputElement | null>(null);
  // item 89: token do Turnstile — '' enquanto a feature estiver desligada (sem site key
  // o widget não renderiza, e sem secret o backend nem olha esse campo).
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileFieldHandle | null>(null);
  const navigate = useNavigate();
  const { register, error, isLoading, isAuthenticated, checkSession } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { id, value, type, checked } = e.target;
    let next: string | boolean = type === 'checkbox' ? checked : value;
    if (type !== 'checkbox' && typeof next === 'string' && FIELD_MAX_LEN[id]) {
      if (id === 'username') next = sanitizeRegisterUsername(next);
      else if (id === 'email') next = sanitizeRegisterEmail(next);
      else if (id === 'password' || id === 'confirmPassword') next = sanitizeRegisterPassword(next);
      else if (id === 'refCode') next = sanitizeRegisterRefCode(next);
      else next = String(next).slice(0, FIELD_MAX_LEN[id] ?? 512);
    }
    setFormData((prev) => ({ ...prev, [id]: next }));
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const focusTermsCheckbox = () => {
    window.requestAnimationFrame(() => termsCheckboxRef.current?.focus());
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const pw = sanitizeRegisterPassword(formData.password);
    const cpw = sanitizeRegisterPassword(formData.confirmPassword);
    if (pw !== cpw) return toast.error(t('auth.register.errors.password_mismatch'));

    const u = sanitizeRegisterUsername(formData.username);
    if (u.length < REGISTER_USERNAME_MIN) return toast.error(t('auth.register.errors.username_too_short'));
    if (u.length > REGISTER_USERNAME_MAX) return toast.error(t('auth.register.errors.username_too_long'));
    if (!validateUsernameShape(u)) return toast.error(t('auth.register.errors.username_invalid'));

    const em = sanitizeRegisterEmail(formData.email);
    if (!em || em.length > REGISTER_EMAIL_MAX_LEN) {
      return toast.error(em ? t('auth.register.errors.email_too_long') : t('auth.register.errors.email_invalid'));
    }
    if (!validateEmailShape(em)) return toast.error(t('auth.register.errors.email_invalid'));
    if (!isRegisterAllowedEmailDomain(em)) return toast.error(t('auth.register.errors.email_provider_not_allowed'));

    if (pw.length < REGISTER_PASSWORD_MIN_LEN) return toast.error(t('auth.register.errors.password_min'));
    if (pw.length > REGISTER_PASSWORD_MAX_LEN) return toast.error(t('auth.register.errors.password_max'));

    const ref = sanitizeRegisterRefCode(formData.refCode);
    if (ref && (ref.length > REGISTER_REF_CODE_MAX_LEN || !/^[a-zA-Z0-9]+$/.test(ref))) {
      return toast.error(t('auth.register.errors.ref_code_invalid'));
    }

    if (!formData.acceptTerms) {
      setFieldErrors({ acceptTerms: t('validation.errors.termsRequired') });
      focusTermsCheckbox();
      return;
    }

    const referrerDomain = (() => {
      try {
        return document.referrer ? new URL(document.referrer).hostname : undefined;
      } catch {
        return undefined;
      }
    })();

    const result = await register({
      username: u,
      email: em,
      password: pw,
      refCode: ref,
      acceptTerms: formData.acceptTerms,
      referrerDomain,
      cfTurnstileToken: turnstileToken || undefined,
    });

    if (!result.success) {
      // Token do Turnstile é single-use — resetar o widget após qualquer falha, senão a
      // próxima tentativa reenvia um token já consumido e falha de novo.
      turnstileRef.current?.reset();
      setTurnstileToken('');
      if (result.fieldPath === 'acceptTerms') {
        setFieldErrors({
          acceptTerms: String(result.fieldMessage || t('validation.errors.termsRequired')),
        });
        focusTermsCheckbox();
        return;
      }
      toast.error(safeInlineMessage(result.message || t('auth.register.errors.registration_failed')));
      return;
    }

    await checkSession({ silent: true });
    navigate('/dashboard');
  };

  const displayStoreError = error ? safeInlineMessage(error) : '';

  return {
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
  };
}
