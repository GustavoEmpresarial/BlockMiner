import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import BrandLogo from '../../shared/components/BrandLogo';
import { api, useAuthStore } from '../../shared/auth/auth.store';
import { resolveApiErrorMessage } from '../../shared/utils/apiErrorI18n';

/**
 * item 95 Parte B (pentest blockminer.space) — consome `?token=` do link enviado por email
 * (`POST /api/auth/verify-email`) e mostra sucesso/erro. Página pública (não exige sessão —
 * o token na URL já é a prova de posse do email), mas se o usuário JÁ estiver logado (caso
 * comum: abriu o link no mesmo navegador em que já tinha feito login no registro), refaz a
 * checkSession pra o app parar de mostrar o banner de "confirme seu email" na hora.
 */
export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const checkSession = useAuthStore((s) => s.checkSession);
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage(t('auth.verifyEmail.missing_token'));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await api.post('/auth/verify-email', { token });
        if (cancelled) return;
        setState('success');
        void checkSession({ silent: true });
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setErrorMessage(resolveApiErrorMessage(err, t('auth.verifyEmail.error_body')));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, checkSession, t]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-700" />

      <div className="w-full max-w-[440px] relative z-10">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <BrandLogo variant="auth" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('auth.verifyEmail.title')}</h1>
        </div>

        <div className="bg-surface/50 backdrop-blur-xl border border-gray-800/50 rounded-[2.5rem] p-10 shadow-2xl text-center">
          {state === 'loading' ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-gray-400 text-sm font-medium">{t('auth.verifyEmail.loading')}</p>
            </div>
          ) : null}

          {state === 'success' ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 flex flex-col items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <p className="text-emerald-300 text-sm font-bold leading-relaxed">{t('auth.verifyEmail.success_body')}</p>
            </div>
          ) : null}

          {state === 'error' ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 flex flex-col items-center gap-3">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <p className="text-red-400 text-sm font-bold leading-relaxed">{errorMessage}</p>
            </div>
          ) : null}

          <div className="mt-8">
            <Link
              to="/dashboard"
              className="inline-block w-full py-4 px-6 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98]"
            >
              {t('auth.verifyEmail.go_dashboard')}
            </Link>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-gray-600 hover:text-gray-400 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
          >
            {t('common.back')}
          </Link>
        </div>
      </div>
    </div>
  );
}
