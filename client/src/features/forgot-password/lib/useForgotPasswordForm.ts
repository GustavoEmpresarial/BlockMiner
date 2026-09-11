import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AxiosError } from 'axios';
import { api } from '../../../shared/auth/auth.store';
import { resolveApiErrorMessage } from '../../../shared/utils/apiErrorI18n';

/** All state and submit handlers for ForgotPasswordPage — kept out of the component so it stays JSX-only. */
export function useForgotPasswordForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [resetToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    try {
      setIsSubmitting(true);
      await api.post('/auth/forgot-password', { email });
      setDone(true);
      toast.success(t('auth.forgot.email_sent'));
    } catch (err: unknown) {
      const message = resolveApiErrorMessage(err, t('auth.forgot.process_failed'));
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      const message = t('auth.forgot.password_min');
      setError(message);
      toast.error(message);
      return;
    }
    if (newPassword !== confirmPassword) {
      const message = t('auth.forgot.password_mismatch');
      setError(message);
      toast.error(message);
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await api.post('/auth/legacy-password-reset', { resetToken, newPassword });
      toast.success(res.data?.message || t('auth.forgot.reset_success'));
      navigate('/login');
    } catch (err: unknown) {
      const message = resolveApiErrorMessage(err, t('auth.forgot.reset_failed'));
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    navigate,
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
  };
}
